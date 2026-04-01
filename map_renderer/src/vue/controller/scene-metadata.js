const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const CHEST_ITEM_SPAWNER_SHAPE = 0x0476;
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const MONSTER_SPAWNER_SHAPE = 0x04d0;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;
const BOX_EW_SHAPE = 0x0080;
const MONITNS_SHAPE = 0x0102;
const MONITEW_SHAPE = 0x0165;
const FASTSKIL_SHAPE = 0x0120;
const PANELNS_SHAPE = 0x00a1;
const CARD_NS_SHAPE = 0x031d;
const NUMBERS_SHAPE = 0x033a;
const NPCTRIG_SHAPE = 0x0363;
const CRUZTRIG_SHAPE = 0x0365;
const VMAIL_SHAPE = 0x0367;
const NPC_ONLY_SHAPE = 0x0366;
const SPANEL_SHAPE = 0x03aa;
const FLAMEBOX_SHAPE = 0x0403;
const TRIGPAD_SHAPE = 0x04cd;
const SKILLBOX_SHAPE = 0x04e3;
const SFXTRIG_SHAPE = 0x04e2;
const DEATHBOX_SHAPE = 0x04e7;
const CMD_LINK_SHAPE = 0x04b1;
const EVENT_SHAPE = 0x0361;
const DOOR_DEATH_HELPER_SHAPE = 0x04f8;
const BRO_BOOT_SHAPE = 0x04fe;
const STEAMBOX_SHAPE = 0x0500;
const ALARMHAT_SHAPE = 0x0561;
const ALRMTRIG_SHAPE = 0x0581;
const CHEST_NS_SHAPE = 0x054f;
const CHEST_EW_SHAPE = 0x0550;
const CMD_LINK_MAX_DISTANCE = 768;

export function createSceneMetadataHelpers(dependencies) {
  const {
    state,
    escapeHtml,
    getNpcSpawnerInfo,
    getShapeDefinition,
    getLinkedPreviewDisplay,
    formatNumericField,
    formatWorldCoords
  } = dependencies;

  function isMonsterSpawnerItem(item, definition = null) {
    return definition?.shape === MONSTER_SPAWNER_SHAPE;
  }

  function isMonsterSpawnerAutoEnterEnabled(item) {
    return (((item?.mapNum ?? 0) & 0x08) === 0);
  }

  function getMonsterSpawnerActivationSummary(item) {
    if (item?.frame === 0) {
      return isMonsterSpawnerAutoEnterEnabled(item)
        ? "Frame 0 plus clear map bit 0x08 uses the MONSTER enterFastArea auto-spawn lane."
        : "Frame 0 is armed, but map bit 0x08 suppresses the MONSTER enterFastArea auto-spawn lane.";
    }
    if (item?.frame === 1) {
      return "Frame 1 skips the MONSTER enterFastArea hook and is more likely used in paired or externally signaled setups.";
    }
    return `Frame ${formatNumericField(item?.frame)} is not yet characterized for MONSTER enterFastArea.`;
  }

  function canResolveNpcInfo(item, definition = null) {
    if (!Number.isInteger(item?.npcNum) || item.npcNum <= 0) {
      return false;
    }
    if (DTABLE_NPC_SHAPES.has(definition?.shape)) {
      return true;
    }
    return definition?.shape === MONSTER_EGG_PREVIEW_SHAPE && item.frame === 0 && item.egg?.type === "monster-spawn";
  }

  function getNpcSpawnerInfoForItem(item, definition = null) {
    if (!canResolveNpcInfo(item, definition)) {
      return null;
    }
    return getNpcSpawnerInfo(state.current?.selected?.game ?? null, item.npcNum);
  }

  function renderNpcMetadataRows(item, definition = null) {
    const npcInfo = getNpcSpawnerInfoForItem(item, definition);
    const npcValue = npcInfo
      ? `${item.npcNum} (${npcInfo.name})`
      : formatNumericField(item.npcNum);
    const npcShapeRow = npcInfo?.shapeHex
      ? `
        <dt>NPC shape</dt><dd>${escapeHtml(npcInfo.shapeHex)}</dd>`
      : "";
    const frameNoteRow = definition?.shape === 0x04d0
      ? `
        <dt>04D0 frame note</dt><dd>${escapeHtml(item.frame === 0
          ? "Frame 0 is the state directly targeted by the current alarm/helper scans."
          : "Frame 1 appears to be a paired state; current script evidence still targets frame 0 helpers.")}</dd>`
      : "";
    const crusaderRowNote = npcInfo?.name?.trim().toLowerCase() === "crusader" && item.npcNum === 0
      ? `
        <dt>NPC note</dt><dd>DTABLE row 0 is named Crusader, but this may be a template or sentinel row rather than a literal spawn target.</dd>`
      : "";
    return `
        <dt>NPC</dt><dd>${escapeHtml(npcValue)}</dd>${npcShapeRow}${crusaderRowNote}
        <dt>Map</dt><dd>${escapeHtml(formatNumericField(item.mapNum))}</dd>
        <dt>Quality</dt><dd>${escapeHtml(formatNumericField(item.quality))}</dd>${frameNoteRow}
      `;
  }

  function renderChestSpawnerMetadataRows(item, definition = null) {
    if (definition?.shape !== CHEST_ITEM_SPAWNER_SHAPE || !item?.itemPreview) {
      return "";
    }

    const previewDisplay = getLinkedPreviewDisplay(item.itemPreview);
    if (!previewDisplay) {
      return "";
    }

    const rawFrameSuffix = Number.isInteger(item.itemPreview.rawFrame) && item.itemPreview.rawFrame !== item.itemPreview.frame
      ? ` (raw ${item.itemPreview.rawFrame})`
      : "";
    const qualityKey = item.quality & 0xff;

    return `
        <dt>Chest item</dt><dd>${escapeHtml(previewDisplay.displayName)}</dd>
        <dt>Chest item shape</dt><dd>${escapeHtml(`${previewDisplay.shapeHex} frame ${item.itemPreview.frame}${rawFrameSuffix}`)}</dd>
        <dt>Chest match key</dt><dd>${escapeHtml(`QLo ${qualityKey}`)}</dd>
      `;
  }

  function getMonsterSpawnerSignalKey(item) {
    return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
  }

  function getMonsterSpawnerItems() {
    if (!state.current) {
      return [];
    }
    return state.current.scene.items.filter((item) => isMonsterSpawnerItem(item, getShapeDefinition(item.shapeDefId)));
  }

  function getMonsterSpawnerPairCandidates(item) {
    const signalKey = getMonsterSpawnerSignalKey(item);
    if (!state.current || !Number.isInteger(signalKey)) {
      return [];
    }

    return getMonsterSpawnerItems().filter((candidate) => {
      if (candidate.id === item.id) {
        return false;
      }
      if (candidate.frame === item.frame) {
        return false;
      }
      if (getMonsterSpawnerSignalKey(candidate) !== signalKey) {
        return false;
      }
      return Math.hypot(candidate.world.x - item.world.x, candidate.world.y - item.world.y) <= MONSTER_SPAWNER_PAIR_MAX_DISTANCE;
    });
  }

  function renderMonsterSpawnerActivationRows(item, definition = null) {
    if (!isMonsterSpawnerItem(item, definition)) {
      return "";
    }

    const qLo = item.quality & 0xff;
    const enterAreaNote = isMonsterSpawnerAutoEnterEnabled(item)
      ? "mapNum bit 0x08 clear"
      : "mapNum bit 0x08 set";
    const pairCandidates = getMonsterSpawnerPairCandidates(item);
    const qLoNote = qLo >= 0 && qLo <= 2
      ? `<dt>QLo hint</dt><dd>Low quality ${escapeHtml(qLo)} is in the small 0/1/2 lane that Regret ALARMHAT difficulty-gates before equipping nearby 0x04D0 objects.</dd>`
      : "";
    const pairCandidateNote = pairCandidates.length
      ? `<dt>Pair candidates</dt><dd>${escapeHtml(`${pairCandidates.length} nearby opposite-frame 0x04D0 item${pairCandidates.length === 1 ? "" : "s"} share this QLo link key.`)}</dd>`
      : "";

    return `
        <dt>Activation</dt><dd>${escapeHtml(getMonsterSpawnerActivationSummary(item))}</dd>
        <dt>Enter-area gate</dt><dd>${escapeHtml(enterAreaNote)}</dd>
        <dt>Signal key</dt><dd>${escapeHtml(String(qLo))}</dd>${qLoNote}${pairCandidateNote}
      `;
  }

  function renderMonsterSpawnerEditor(item, definition = null, hasEditableRecord = false) {
    if (!isMonsterSpawnerItem(item, definition) || !hasEditableRecord) {
      return "";
    }

    const frameOptions = [0, 1].map((value) => {
      const label = value === 0 ? "Frame 0: enter-area checked" : "Frame 1: skip enter-area";
      return `<option value="${value}" ${item.frame === value ? "selected" : ""}>${label}</option>`;
    }).join("");
    const enterMode = isMonsterSpawnerAutoEnterEnabled(item) ? "auto" : "blocked";

    return `
      <div class="tooltip-spawner-editor">
        <label class="tooltip-field tooltip-grid-field">
          <span class="tooltip-grid-field-label">Spawner frame</span>
          <select class="tooltip-field-input" data-monster-spawner-frame>
            ${frameOptions}
          </select>
        </label>
        <label class="tooltip-field tooltip-grid-field">
          <span class="tooltip-grid-field-label">Enter-area lane</span>
          <select class="tooltip-field-input" data-monster-spawner-enter-mode>
            <option value="auto" ${enterMode === "auto" ? "selected" : ""}>Auto spawn on enter area</option>
            <option value="blocked" ${enterMode === "blocked" ? "selected" : ""}>Block auto spawn on enter area</option>
          </select>
        </label>
        <p class="tooltip-editor-note">Verified path: MONSTER.enterFastArea only checks frame 0, and it suppresses the automatic lane when mapNum bit 0x08 is set.</p>
        <button class="tooltip-save-button" type="button" data-action="save-monster-spawner">Apply Spawner State</button>
      </div>
    `;
  }

  function formatDefinitionDimensions(definition) {
    const dimensions = definition?.dimensions;
    if (!dimensions) {
      return "";
    }
    return `${dimensions.x} x ${dimensions.y} x ${dimensions.z}`;
  }

  function formatByteHex(value) {
    return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
  }

  function formatWordHex(value) {
    return `0x${(value & 0xffff).toString(16).padStart(4, "0")}`;
  }

  function createUsecodeViewTarget(className, slot, eventNameHint, note, fallbackEventNameHints = []) {
    const eventLabel = eventNameHint || `slot_${slot.toString(16).padStart(2, "0")}`;
    return {
      className,
      slot,
      eventNameHint,
      fallbackEventNameHints,
      label: `${className}.${eventLabel}`,
      title: `Open ${className}.${eventLabel} in the USECODE viewer`,
      note
    };
  }

  function getQualityLowByte(item) {
    return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
  }

  function getQualityHighByte(item) {
    return Number.isInteger(item?.quality) ? ((item.quality >> 8) & 0xff) : null;
  }

  function getShapeNumber(item) {
    const definition = getShapeDefinition(item?.shapeDefId);
    return Number.isInteger(definition?.shape) ? definition.shape : null;
  }

  function getCmdLinkMetadata(item) {
    const mapByte = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;
    const npcByte = Number.isInteger(item?.npcNum) ? (item.npcNum & 0xff) : null;
    const qLo = getQualityLowByte(item);
    const qHi = getQualityHighByte(item);

    if (mapByte === null || npcByte === null || qLo === null || qHi === null) {
      return null;
    }

    const targetCode = (((mapByte & 0xe0) * 8) + npcByte) & 0x7ff;
    const mode = mapByte & 0x03;
    const itemMode = Boolean(mapByte & 0x04);
    const phaseLane = (mapByte & 0x08) ? 0 : 1;
    const lowPriority = Boolean(mapByte & 0x10);
    const subcommand = qHi & 0x07;
    const subcommandArg = qHi >> 3;

    let targetKind = "exact-shape";
    let targetLabel = `Exact nearby shape ${formatWordHex(targetCode)}`;
    if (targetCode === 0x07ff) {
      targetKind = "family-1";
      targetLabel = "Family-1 target set sentinel (Crus-type NPC lane)";
    } else if (targetCode === 0x07fe) {
      targetKind = "family-6";
      targetLabel = "Family-6 target set sentinel (non-Crus NPC lane)";
    } else if (targetCode === 0x0000) {
      targetKind = "zero";
      targetLabel = "Zero target sentinel";
    }

    let subcommandLabel = `Subcommand ${subcommand}`;
    let subcommandNote = "Recovered TRIGGER lanes for this subcommand remain partly unresolved.";
    if (subcommand === 0) {
      subcommandLabel = `Subcommand 0 (arg ${subcommandArg})`;
      subcommandNote = "Helper dispatch lane. It scans nearby 0x0476 helpers that share this link id and forwards the arg into FREE.slot_30 using the helper's packed npc/map payload rather than editing the matched target directly.";
    } else if (subcommand === 1) {
      subcommandLabel = `Subcommand 1 (arg ${subcommandArg})`;
      subcommandNote = "Direct target-mutation lane. Depending on command mode it broadcasts across matched nearby items to set QHi, QLo, equip, frame, or a timed door pulse, or runs the same logic only on the exact triggering item.";
    } else if (subcommand === 2) {
      subcommandLabel = `Subcommand 2 (arg ${subcommandArg})`;
      subcommandNote = "Frame-set lane. The arg selects the frame value applied to matched targets in the direct item-targeting variant.";
    } else if (subcommand === 3) {
      subcommandLabel = `Subcommand 3 (arg ${subcommandArg})`;
      subcommandNote = "Timed pulse lane. It calls TRIGGER.slot_22 on matched targets, and that wrapper repeatedly drives DOOR.slot_21 for the arg-sized count while a busy/status bit is held.";
    } else if (subcommand === 4) {
      subcommandLabel = `Subcommand 4 (+${subcommandArg})`;
      subcommandNote = "Link-rewrite lane. It adds the arg value to the current QLo/link id and immediately continues the scan with the new link.";
    } else if (subcommand === 5) {
      subcommandLabel = `Subcommand 5 (-${subcommandArg})`;
      subcommandNote = "Link-rewrite lane. It subtracts the arg value from the current QLo/link id and immediately continues the scan with the new link.";
    } else if (subcommand === 6) {
      subcommandLabel = `Subcommand 6 (arg ${subcommandArg})`;
      subcommandNote = "Create-and-drop lane. It resolves payload data through nearby 0x0476 helpers, creates the target item when the packed map byte allows it, copies Q, moves it to the helper coordinates, then unequips/drops it with the arg-sized count.";
    }

    return {
      qLo,
      qHi,
      mapByte,
      npcByte,
      targetCode,
      targetKind,
      targetLabel,
      mode,
      itemMode,
      phaseLane,
      lowPriority,
      subcommand,
      subcommandArg,
      subcommandLabel,
      subcommandNote
    };
  }

  function getCmdLinkCandidateSummary(item) {
    if (!state.current) {
      return null;
    }

    const metadata = getCmdLinkMetadata(item);
    if (!metadata || metadata.targetKind !== "exact-shape") {
      return null;
    }

    const matchingShape = [];
    const matchingLink = [];
    for (const candidate of state.current.scene.items) {
      if (candidate.id === item.id) {
        continue;
      }
      const candidateShape = getShapeNumber(candidate);
      if (candidateShape !== metadata.targetCode) {
        continue;
      }
      const distance = Math.hypot(candidate.world.x - item.world.x, candidate.world.y - item.world.y);
      if (distance > CMD_LINK_MAX_DISTANCE) {
        continue;
      }
      matchingShape.push(candidate);
      if (metadata.qLo === 0xff || getQualityLowByte(candidate) === metadata.qLo) {
        matchingLink.push(candidate);
      }
    }

    if (!matchingShape.length) {
      return {
        ...metadata,
        matchingShape,
        matchingLink,
        preview: []
      };
    }

    const preview = matchingLink.slice(0, 3).map((candidate) => {
      const definition = getShapeDefinition(candidate.shapeDefId);
      const name = definition?.displayName || candidate.shapeDefId;
      const qLo = getQualityLowByte(candidate);
      return `${name} @ ${formatWorldCoords(candidate.world)}${qLo === null ? "" : `, QLo ${qLo}`}`;
    });

    return {
      ...metadata,
      matchingShape,
      matchingLink,
      preview
    };
  }

  function getDefinitionTraitLabels(definition) {
    if (!definition?.traits) {
      return [];
    }
    const traits = [];
    if (definition.traits.occluding) {
      traits.push("occluding");
    }
    if (definition.traits.translucent) {
      traits.push("translucent");
    }
    if (definition.traits.solid) {
      traits.push("solid");
    }
    if (definition.traits.fixed) {
      traits.push("fixed");
    }
    if (definition.traits.land) {
      traits.push("land");
    }
    if (definition.traits.draw) {
      traits.push("draw");
    }
    if (definition.traits.invitem) {
      traits.push("inventory-item");
    }
    if (Number.isInteger(definition.traits.animType) && definition.traits.animType !== 0) {
      traits.push(`anim:${definition.traits.animType}`);
    }
    return traits;
  }

  function getDefinitionRoleHint(item, definition) {
    if (!definition) {
      return "";
    }
    if (definition.shape === BOX_EW_SHAPE) {
      return "BOX_EW switch family; use() only fires while map-array is clear, dispatching TRIGGER lane 1 from frame 0 and lane 0 from nonzero frames. Sampled scenes only justify same-QLo cmd-link arrows for frame 0.";
    }
    if (definition.shape === MONITNS_SHAPE) {
      return "MONITNS monitor/computer-adjacent object; the live MONITNS.use body makes this a stronger first-view gameplay script target than generic chest props.";
    }
    if (definition.shape === MONITEW_SHAPE) {
      return "MONITEW monitor/computer-adjacent object; the east-west variant also has a live use handler and sits in the same practical viewer family as MONITNS.";
    }
    if (definition.shape === FASTSKIL_SHAPE) {
      return "FASTSKIL fast-area trigger gate; enterFastArea waits briefly, uses difficulty to choose trigger lane or remap QLo, and frame 2 exposes explicit diff1/diff2/diff3+ link lanes.";
    }
    if (definition.shape === MONSTER_SPAWNER_SHAPE) {
      return "MONSTER helper/spawner; frame 0 participates in the verified MONSTER.enterFastArea auto-spawn lane, while mapNum bit 0x08 suppresses that automatic enter-area path.";
    }
    if (definition.shape === PANELNS_SHAPE) {
      return "PANELNS switch/panel controller; its use() lane forwards the local QLo key through nearby trigger helpers rather than acting as a plain decorative panel.";
    }
    if (definition.shape === NPCTRIG_SHAPE) {
      return "NPCTRIG compact event-bearing trigger object; slot 0x0A is the strongest current active-event body and slot 0x20 acts as the paired helper lane.";
    }
    if (definition.shape === CRUZTRIG_SHAPE) {
      return "CRUZTRIG trigger/helper object; the recovered gotHit body makes this a concrete trigger-bearing gameplay object rather than a generic editor placeholder.";
    }
    if (definition.shape === VMAIL_SHAPE) {
      return "VMAIL voice/mail helper object; the active known body is slot 0x0A, making it a valid first-view usecode target even though the exact event semantics are still weaker than the slot number.";
    }
    if (definition.shape === CARD_NS_SHAPE) {
      return "CARD_NS keyed switch controller; the thin use() wrapper immediately hands off into the downstream SWITCH/TRIGGER chain keyed by local QLo.";
    }
    if (definition.shape === NUMBERS_SHAPE) {
      return "Tiny readout/number helper family; glyph-sized markers that cluster beside nearby 0x0501/0x0502/0x0503/0x0505/0x0507 display pieces rather than the trigger-link helper network.";
    }
    if (definition.shape === SKILLBOX_SHAPE) {
      return "SKILLBOX difficulty/skill gate; frame 0 and 1 switch trigger lanes by difficulty, and frame 2 remaps QLo before dispatch.";
    }
    if (definition.shape === CHEST_NS_SHAPE || definition.shape === CHEST_EW_SHAPE) {
      return "Chest object; use opens the chest, plays the local animation/audio path, and can spawn contents through FREE rather than behaving like a simple decorative container.";
    }
    if (definition.shape === CMD_LINK_SHAPE) {
      return "Trigger/link controller; TRIGGER reads QLo as the link id, uses mapNum low bits as phase and routing flags, and derives the target search shape from npcNum plus mapNum high bits.";
    }
    if (definition.shape === EVENT_SHAPE) {
      return "EVENT controller; a generic scripted event multiplexer that reuses QLo as a local link id and can drive triggers, doors, camera, audio, and nearby helper shapes.";
    }
    if (definition.shape === NPC_ONLY_SHAPE) {
      return "NPC_ONLY trigger helper; its active gotHit() body is the recovered lane that reacts to scripted hit routing rather than direct player use.";
    }
    if (definition.shape === SPANEL_SHAPE) {
      return "SPANEL switch controller; its use() body participates in the same local QLo trigger-helper network as PANELNS and CARD_NS.";
    }
    if (definition.shape === FLAMEBOX_SHAPE) {
      return "FLAMEBOX hazard controller; equip scans nearby flame-family helpers by shared QLo and can swap helper markers into active flame actors.";
    }
    if (definition.shape === TRIGPAD_SHAPE) {
      return "TRIGPAD occupancy/surface-gated trigger pad; gotHit waits briefly, dispatches trigger lanes 0 then 1, and can prod nearby elevator helpers. Broader scene sweeps did not justify a generic cmd-link arrow rule.";
    }
    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      return "Destroyable-door helper; DOOR.slot_23 scans nearby 0x04F8 items with matching QLo and dispatches trigger lane 0 or +0x80 by map-array state after the door damage path.";
    }
    if (definition.shape === SFXTRIG_SHAPE) {
      return "SFXTRIG minimal event-core helper; the active low slot is event 0x0A, and this family is one of the compact event-bearing controller records beside broader EVENT/NPCTRIG hubs.";
    }
    if (definition.shape === DEATHBOX_SHAPE) {
      return "DEATHBOX NPC-death helper; slot 0x0A is the recovered helper body that matches death-link QLo and forwards into TRIGGER lanes from NPC death events.";
    }
    if (definition.shape === BRO_BOOT_SHAPE) {
      return "BRO_BOOT helper; enterFastArea scans nearby SPANEL items by shared QLo, toggles their ITEM control slots, and runs its own boot-sequence animation.";
    }
    if (definition.shape === STEAMBOX_SHAPE) {
      return "STEAMBOX hazard controller; nearby steam-family helpers are matched by QLo and dispatched through STEAMBOX control slots.";
    }
    if (definition.shape === ALARMHAT_SHAPE) {
      return "ALARMHAT local alarm driver; equips nearby 0x04D0 helpers and uses frame-dependent gating rather than DTABLE NPC payloads.";
    }
    if (definition.shape === ALRMTRIG_SHAPE) {
      return "ALRMTRIG alert relay; chooses trigger lanes 0/1 or +0x80/+0x81 from map-array state and the current world alert flag.";
    }
    if (definition.shape === CHEST_ITEM_SPAWNER_SHAPE) {
      return "Chest item spawner; chest usecode matches nearby 0x0476 helpers by QLo and FREE.slot_2E resolves the spawned item from mapNum/npcNum.";
    }
    if (definition.shape === 0x04d0) {
      return "Editor/controller NPC spawner using DTABLE-backed npcNum rows.";
    }
    if (definition.shape === MONSTER_EGG_PREVIEW_SHAPE && item.egg?.type === "monster-spawn") {
      return "Monster egg spawn entry; egg ID comes from mapNum >> 3 and Remorse can still use npcNum as a DTABLE actor row.";
    }

    const catalogText = [definition.displayName, definition.description, definition.catalogEntry?.humanReadableId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (catalogText.includes("invisible_wall") || catalogText.includes("invisible wall") || catalogText.includes("editor_wall")) {
      return "Catalog tags this as an invisible/editor wall helper rather than visible world art.";
    }
    if (catalogText.includes("camera")) {
      return "Catalog tags this as a camera/helper marker.";
    }
    if (catalogText.includes("light_bridge") || catalogText.includes("light bridge")) {
      return "Catalog tags this as a light-bridge editor marker.";
    }
    if (catalogText.includes("placeholder")) {
      return "Catalog tags this as a placeholder/editor marker.";
    }
    if (catalogText.includes("wallgun_shape")) {
      return "Auto-derived helper shape associated with WALLGUN self-shape usage in USECODE.";
    }
    if (definition.kind === "helper") {
      return "Helper-class placement; likely used for logic, markers, or invisible support geometry.";
    }
    if (definition.kind === "editor") {
      return "Editor-class placement; usually authored as a visible or semi-visible map-editing aid.";
    }
    if (definition.kind === "egg") {
      return "Egg-family placement; map, npc, and quality fields are interpreted by egg-family rules rather than one global schema.";
    }
    return "";
  }

  function getUsecodeViewTarget(item, definition = null) {
    if (!definition) {
      return null;
    }

    if (definition.shape === BOX_EW_SHAPE) {
      return createUsecodeViewTarget("BOX_EW", 0x01, "use", "Frame-0 BOX_EW switches dispatch their local link through BOX_EW.use before forwarding into TRIGGER.slot_20.");
    }
    if (definition.shape === MONITNS_SHAPE) {
      return createUsecodeViewTarget("MONITNS", 0x01, "use", "MONITNS.use is a live computer-adjacent gameplay handler and is the strongest current first-view target for monitor objects.");
    }
    if (definition.shape === MONITEW_SHAPE) {
      return createUsecodeViewTarget("MONITEW", 0x01, "use", "MONITEW.use is the east-west monitor variant's live computer-adjacent gameplay handler.");
    }
    if (definition.shape === FASTSKIL_SHAPE) {
      return createUsecodeViewTarget("FASTSKIL", 0x0f, "enterFastArea", "FASTSKIL gates difficulty routing in enterFastArea, including the verified QLo/+1/+2 remap lane.");
    }
    if (definition.shape === MONSTER_SPAWNER_SHAPE && item?.frame === 0) {
      return createUsecodeViewTarget("MONSTER", 0x0f, "enterFastArea", "Frame-0 0x04D0 spawners participate in the verified MONSTER.enterFastArea auto-spawn lane when mapNum bit 0x08 is clear.");
    }
    if (definition.shape === PANELNS_SHAPE) {
      return createUsecodeViewTarget("PANELNS", 0x01, "use", "PANELNS.use is the recovered panel-switch wrapper that passes the local QLo key into the trigger chain.");
    }
    if (definition.shape === NPCTRIG_SHAPE) {
      return createUsecodeViewTarget("NPCTRIG", 0x0a, "equip", "NPCTRIG.equip is the strongest compact active-event body currently recovered for this trigger family.");
    }
    if (definition.shape === CRUZTRIG_SHAPE) {
      return createUsecodeViewTarget("CRUZTRIG", 0x06, "gotHit", "CRUZTRIG.gotHit is the recovered active body for this trigger/helper family.");
    }
    if (definition.shape === VMAIL_SHAPE) {
      return createUsecodeViewTarget("VMAIL", 0x0a, null, "VMAIL slot 0x0A is the live helper body for this voice/mail object family.");
    }
    if (definition.shape === CARD_NS_SHAPE) {
      return createUsecodeViewTarget("CARD_NS", 0x01, "use", "CARD_NS.use is the verified thin wrapper into the same SWITCH/TRIGGER path; Regret also has a cast body if the use wrapper is absent.", ["cast"]);
    }
    if (definition.shape === EVENT_SHAPE) {
      return createUsecodeViewTarget("EVENT", 0x0a, "equip", "EVENT.equip is the big multiplexer body used by recovered local event controllers.");
    }
    if (definition.shape === NPC_ONLY_SHAPE) {
      return createUsecodeViewTarget("NPC_ONLY", 0x06, "gotHit", "NPC_ONLY.gotHit is the recovered active body for hit-driven helper triggers.");
    }
    if (definition.shape === SPANEL_SHAPE) {
      return createUsecodeViewTarget("SPANEL", 0x01, "use", "SPANEL.use participates in the same nearby cmd-helper routing as PANELNS and CARD_NS.");
    }
    if (definition.shape === FLAMEBOX_SHAPE) {
      return createUsecodeViewTarget("FLAMEBOX", 0x0a, "equip", "FLAMEBOX.equip is the recovered local flame-controller body that scans nearby helper shapes by shared QLo.");
    }
    if (definition.shape === TRIGPAD_SHAPE) {
      return createUsecodeViewTarget("TRIGPAD", 0x06, "gotHit", "TRIGPAD.gotHit contains the occupancy-gated pad logic plus the recovered trigger-lane dispatches.");
    }
    if (definition.shape === CMD_LINK_SHAPE) {
      return createUsecodeViewTarget("TRIGGER", 0x20, null, "TRIGGER.slot_20 is the shared high-slot fan-out lane that nearby controller objects keep spawning on matched link ids.");
    }
    if (definition.shape === SKILLBOX_SHAPE) {
      return createUsecodeViewTarget("SKILLBOX", 0x0a, "equip", "SKILLBOX.equip is the verified skill-gated controller body for the recovered difficulty switch family.");
    }
    if (definition.shape === CHEST_NS_SHAPE) {
      return createUsecodeViewTarget("CHEST_NS", 0x01, "use", "CHEST_NS.use is the live chest-open handler that drives the animation/audio path and content spawn flow.");
    }
    if (definition.shape === CHEST_EW_SHAPE) {
      return createUsecodeViewTarget("CHEST_EW", 0x01, "use", "CHEST_EW.use is the live chest-open handler that drives the animation/audio path and content spawn flow.");
    }
    if (definition.shape === SFXTRIG_SHAPE) {
      return createUsecodeViewTarget("SFXTRIG", 0x0a, null, "SFXTRIG slot 0x0A is the active minimal event-core body for this local sound/trigger helper family.");
    }
    if (definition.shape === DEATHBOX_SHAPE) {
      return createUsecodeViewTarget("DEATHBOX", 0x0a, null, "DEATHBOX slot 0x0A is the recovered NPC-death helper body that matches death-link QLo and forwards into TRIGGER lanes.");
    }
    if (definition.shape === BRO_BOOT_SHAPE) {
      return createUsecodeViewTarget("BRO_BOOT", 0x0f, "enterFastArea", "BRO_BOOT.enterFastArea is the recovered helper body that toggles nearby SPANEL items by shared QLo.");
    }
    if (definition.shape === STEAMBOX_SHAPE) {
      return createUsecodeViewTarget("STEAMBOX", 0x0a, "equip", "STEAMBOX.equip is the recovered hazard-controller body that routes nearby steam helpers through event 0/1 lanes.");
    }
    if (definition.shape === ALARMHAT_SHAPE) {
      return createUsecodeViewTarget("ALARMHAT", 0x0a, "equip", "ALARMHAT.equip is the verified local alarm scan that walks nearby 0x04D0 helpers.");
    }
    if (definition.shape === ALRMTRIG_SHAPE) {
      return createUsecodeViewTarget("ALRMTRIG", 0x0a, "equip", "ALRMTRIG.equip is the recovered alert relay that selects TRIGGER lanes from map-array and world-alert state.");
    }

    return null;
  }

  function renderSpecialEditorRows(item, definition = null) {
    if (!definition) {
      return "";
    }

    const rows = [];
    const rawQuality = Number.isInteger(item?.quality) ? (item.quality & 0xffff) : null;
    const qLo = rawQuality === null ? null : (rawQuality & 0xff);
    const qHi = rawQuality === null ? null : ((rawQuality >> 8) & 0xff);
    const rawMapNum = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;

    if (definition.shape === BOX_EW_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>BOX_EW</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Switch bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Trigger lane</dt><dd>Frame 0 is the active switch lane: while map-array is clear it plays the switch SFX and dispatches TRIGGER lane 1.</dd>");
        if (qLo !== null) {
          rows.push(`<dt>Helper overlay</dt><dd>${escapeHtml(`Current renderer arrows only expose nearby same-QLo 0x04B1 helpers for frame 0, using local link id ${qLo}.`)}</dd>`);
        }
      } else {
        rows.push("<dt>Trigger lane</dt><dd>Nonzero frames still dispatch through TRIGGER, but the recovered body uses lane 0 and sampled scenes did not justify the same generic cmd-link overlay rule.</dd>");
      }
    }

    if (definition.shape === FASTSKIL_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>FASTSKIL</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Quality bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Activation</dt><dd>enterFastArea waits 5 ticks, then only runs the skill/trigger body while map-array is clear.</dd>");
      if (item?.frame === 0) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 0 uses TRIGGER lane 0 below difficulty 2 and lane 1 at difficulty 2 and above, then clears QLo on return.</dd>");
      } else if (item?.frame === 1) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 1 uses TRIGGER lane 0 below difficulty 3 and lane 1 at difficulty 3 and above, then clears QLo on return.</dd>");
      } else if (item?.frame === 2) {
        rows.push("<dt>Skill lane</dt><dd>Frame 2 preserves the base QLo and dispatches diff1 -&gt; QLo, diff2 -&gt; QLo + 1, diff3+ -&gt; QLo + 2 before restoring the original QLo.</dd>");
        if (qLo !== null) {
          rows.push(`<dt>Derived cmd lanes</dt><dd>${escapeHtml(`diff1 -> QLo ${qLo}, diff2 -> QLo ${(qLo + 1) & 0xff}, diff3+ -> QLo ${(qLo + 2) & 0xff}`)}</dd>`);
        }
      }
    }

    if (definition.shape === SKILLBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>SKILLBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Quality bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (item?.frame === 0) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 0 flips at difficulty 2: below threshold uses trigger lane 1, threshold and above uses lane 0.</dd>");
      } else if (item?.frame === 1) {
        rows.push("<dt>Difficulty gate</dt><dd>Frame 1 flips at difficulty 3: lower difficulties use trigger lane 1, difficulty 3 and above uses lane 0.</dd>");
      } else if (item?.frame === 2) {
        rows.push("<dt>Skill lane</dt><dd>Frame 2 uses QLo as a base skill/link id and dispatches diff1 -> QLo, diff2 -> QLo + 1, diff3+ -> QLo + 2 before restoring the original QLo.</dd>");
      }
    }

    if (definition.shape === CMD_LINK_SHAPE) {
      const cmdMetadata = getCmdLinkCandidateSummary(item);
      rows.push("<dt>Decoded role</dt><dd>Trigger/link controller (`cmd` helper), not a DTABLE NPC spawner.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Map flags</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)})`)}</dd>`);
      }
      if (cmdMetadata) {
        rows.push(`<dt>Phase lane</dt><dd>${escapeHtml(`Responds to TRIGGER phase ${cmdMetadata.phaseLane}${cmdMetadata.phaseLane === 0 ? " / 0x80" : " / 0x81"} because map bit 0x08 is ${cmdMetadata.phaseLane === 0 ? "set" : "clear"}.`)}</dd>`);
        rows.push(`<dt>Dispatch mode</dt><dd>${escapeHtml(`${cmdMetadata.itemMode ? "Item-targeting" : "NPC-triggering"} path, mode ${cmdMetadata.mode}, ${cmdMetadata.lowPriority ? "deferred/low-priority" : "immediate"} execution.`)}</dd>`);
        rows.push(`<dt>Target decode</dt><dd>${escapeHtml(`${cmdMetadata.targetLabel} from npcNum ${cmdMetadata.npcByte} + map high bits ${formatByteHex(cmdMetadata.mapByte & 0xe0)}.`)}</dd>`);
        rows.push(`<dt>Operation</dt><dd>${escapeHtml(`${cmdMetadata.subcommandLabel}. ${cmdMetadata.subcommandNote}`)}</dd>`);
        if (cmdMetadata.targetKind === "exact-shape") {
          rows.push(`<dt>Nearby target matches</dt><dd>${escapeHtml(`${cmdMetadata.matchingLink.length} nearby exact-shape target${cmdMetadata.matchingLink.length === 1 ? "" : "s"} share this link id out of ${cmdMetadata.matchingShape.length} nearby shape match${cmdMetadata.matchingShape.length === 1 ? "" : "es"}.`)}</dd>`);
          if (cmdMetadata.preview.length) {
            rows.push(`<dt>Candidate links</dt><dd>${escapeHtml(cmdMetadata.preview.join("; "))}</dd>`);
          }
        }
      }
    }

    if (definition.shape === EVENT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>EVENT</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Event bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Event note</dt><dd>Recovered EVENT.equip reads QLo as a link id and uses different event lanes to drive triggers, camera/audio, door logic, and nearby helper objects.</dd>");
    }

    if (definition.shape === NPCTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>NPCTRIG</dd>");
      rows.push("<dt>Trigger note</dt><dd>Disasm crosswalks shape 0x0363 to NPCTRIG, whose compact slot-0x0A body remains one of the strongest active-event frontiers in the current corpus.</dd>");
    }

    if (definition.shape === CRUZTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>CRUZTRIG</dd>");
      rows.push("<dt>Trigger note</dt><dd>Disasm crosswalks shape 0x0365 to CRUZTRIG, and the recovered live body is gotHit rather than a generic placeholder slot.</dd>");
    }

    if (definition.shape === VMAIL_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>VMAIL</dd>");
      rows.push("<dt>Mail note</dt><dd>Disasm crosswalks shape 0x0367 to VMAIL; slot 0x0A is the active helper body even though the exact event name remains weaker than the slot number.</dd>");
    }

    if (definition.shape === MONITNS_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONITNS</dd>");
      rows.push("<dt>Monitor note</dt><dd>Existing gameplay notes identify shape 0x0102 as a live monitor/computer object whose MONITNS.use body is a defensible first inspection point.</dd>");
    }

    if (definition.shape === MONITEW_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONITEW</dd>");
      rows.push("<dt>Monitor note</dt><dd>Disasm crosswalks shape 0x0165 to the MONITEW east-west monitor variant, which also has a live use handler.</dd>");
    }

    if (definition.shape === MONSTER_SPAWNER_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>MONSTER</dd>");
      rows.push(`<dt>Spawner note</dt><dd>${escapeHtml(getMonsterSpawnerActivationSummary(item))}</dd>`);
      rows.push("<dt>Viewer stance</dt><dd>Frame-0 0x04D0 objects now link directly to MONSTER.enterFastArea because that is the verified automatic enter-area lane.</dd>");
    }

    if (definition.shape === NUMBERS_SHAPE) {
      rows.push("<dt>Decoded family</dt><dd>NUMBERS</dd>");
      rows.push("<dt>Display note</dt><dd>Tiny glyph-like frames in exported scenes cluster beside larger 0x0501/0x0502/0x0503/0x0505/0x0507 readout pieces instead of local trigger controllers.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>Shown as a labeled display helper only; current scene evidence does not support helper arrows from this family.</dd>");
    }

    if (definition.shape === TRIGPAD_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>TRIGPAD</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Pad bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Activation</dt><dd>gotHit is occupancy and surface gated, waits briefly after the pad is armed, then dispatches TRIGGER lane 0 and later lane 1 as the actor leaves or the condition clears.</dd>");
      rows.push("<dt>Extra behavior</dt><dd>The same body also scans nearby elevator-family helpers and can call ELEVAT control slots, so this is broader than a simple one-shot cmd-link source.</dd>");
      rows.push("<dt>Overlay stance</dt><dd>Named and decoded in tooltips, but broader scene sweeps did not justify a generic TRIGPAD -&gt; 0x04B1 helper arrow rule.</dd>");
    }

    if (definition.shape === FLAMEBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>FLAMEBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Flame link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Flame note</dt><dd>Recovered FLAMEBOX.equip uses shared QLo to scan nearby flame-family helpers and can replace helper markers with active flame actors.</dd>");
    }

    if (definition.shape === CHEST_NS_SHAPE || definition.shape === CHEST_EW_SHAPE) {
      rows.push(`<dt>Decoded class</dt><dd>${escapeHtml(definition.shape === CHEST_NS_SHAPE ? "CHEST_NS" : "CHEST_EW")}</dd>`);
      rows.push("<dt>Chest note</dt><dd>Use opens the chest, runs the local animation/audio sequence, and can spawn contents through the FREE object-creation path.</dd>");
    }

    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      rows.push("<dt>Decoded role</dt><dd>Destroyable-door trigger helper.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Door link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Lane select</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): clear routes to trigger lane 0, nonzero routes to lane 0x80.`)}</dd>`);
      }
      rows.push("<dt>Door note</dt><dd>Current read: this helper exists so authored doors can become destroyable and then forward into the normal or +0x80 trigger lane.</dd>");
    }

    if (definition.shape === STEAMBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>STEAMBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Steam link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Steam note</dt><dd>Recovered STEAMBOX.equip matches nearby steam-family helpers by QLo and forwards them into event 0/1 control lanes.</dd>");
    }

    if (definition.shape === SFXTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>SFXTRIG</dd>");
      rows.push("<dt>SFX note</dt><dd>Disasm crosswalks shape 0x04E2 to SFXTRIG, a compact event-bearing helper whose active exported body lives at slot 0x0A.</dd>");
    }

    if (definition.shape === DEATHBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>DEATHBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Death link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Death note</dt><dd>Disasm crosswalks shape 0x04E7 to DEATHBOX, whose slot 0x0A helper body matches death-link QLo and forwards NPC death events into TRIGGER lanes.</dd>");
    }

    if (definition.shape === BRO_BOOT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>BRO_BOOT</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Boot link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Boot note</dt><dd>Recovered BRO_BOOT.enterFastArea scans nearby SPANEL items by shared QLo, applies ITEM control slots, and then runs its own boot animation loop.</dd>");
    }

    if (definition.shape === ALARMHAT_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>ALARMHAT</dd>");
      if (item?.frame === 0) {
        rows.push("<dt>Alarm lane</dt><dd>Frame 0 is the direct local alarm scan: it walks nearby 0x04D0 helpers and targets their frame-0 state.</dd>");
      } else {
        rows.push("<dt>Alarm lane</dt><dd>Nonzero frames add on-screen and nearby-actor gating before the same local 0x04D0 helper scan runs.</dd>");
      }
    }

    if (definition.shape === ALRMTRIG_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>ALRMTRIG</dd>");
      if (rawMapNum !== null) {
        rows.push(`<dt>Alert lane byte</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): zero selects base lanes 0/1, nonzero selects 0x80/0x81.`)}</dd>`);
      }
      rows.push("<dt>Alert note</dt><dd>Recovered ALRMTRIG.equip only checks map-array state and World.getAlertActive() before dispatching one of four TRIGGER lanes.</dd>");
    }

    return rows.join("");
  }

  function shouldShowRawLinkage(item, definition) {
    if (item.egg) {
      return true;
    }
    if (definition?.kind === "editor" || definition?.kind === "helper") {
      return true;
    }
    return [item.mapNum, item.npcNum, item.quality, item.nextItem].some((value) => Number.isInteger(value) && value !== 0);
  }

  function renderObjectMetadataRows(item, definition = null) {
    if (!definition) {
      return "";
    }

    const rows = [];
    const dimensions = formatDefinitionDimensions(definition);
    if (dimensions) {
      rows.push(`<dt>Dimensions</dt><dd>${escapeHtml(dimensions)}</dd>`);
    }

    if (definition.visibilityTags?.length) {
      rows.push(`<dt>Tags</dt><dd>${escapeHtml(definition.visibilityTags.join(", "))}</dd>`);
    }

    const traits = getDefinitionTraitLabels(definition);
    if (traits.length) {
      rows.push(`<dt>Traits</dt><dd>${escapeHtml(traits.join(", "))}</dd>`);
    }

    const roleHint = getDefinitionRoleHint(item, definition);
    if (roleHint) {
      rows.push(`<dt>Role hint</dt><dd>${escapeHtml(roleHint)}</dd>`);
    }

    const usecodeTarget = getUsecodeViewTarget(item, definition);
    if (usecodeTarget) {
      rows.push(`<dt>USECODE</dt><dd>${escapeHtml(`${usecodeTarget.label}: ${usecodeTarget.note}`)}</dd>`);
    }

    const specialRows = renderSpecialEditorRows(item, definition);
    if (specialRows) {
      rows.push(specialRows);
    }

    if (shouldShowRawLinkage(item, definition)) {
      const linkageParts = [
        `map=${formatNumericField(item.mapNum)}`,
        `npc=${formatNumericField(item.npcNum)}`,
        `quality=${formatNumericField(item.quality)}`,
        `next=${formatNumericField(item.nextItem)}`
      ];
      rows.push(`<dt>Raw linkage</dt><dd>${escapeHtml(linkageParts.join(", "))}</dd>`);
    }

    return rows.length ? `${rows.join("")}` : "";
  }

  function buildWarpCommand(item) {
    const mapId = state.current?.selected?.mapId;
    if (!Number.isInteger(mapId)) {
      return "";
    }
    if (item.egg?.type === "teleport-destination" && Number.isInteger(item.egg?.labelId)) {
      return `-warp 0 -mapoff ${mapId} -egg ${item.egg.labelId}`;
    }
    const diskX = Math.trunc(item.world.x / 2);
    const diskY = Math.trunc(item.world.y / 2);
    return `-warp 0 ${diskX} ${diskY} ${item.world.z} -mapoff ${mapId}`;
  }

  return {
    buildWarpCommand,
    getMonsterSpawnerItems,
    getMonsterSpawnerPairCandidates,
    getMonsterSpawnerSignalKey,
    getNpcSpawnerInfoForItem,
    isMonsterSpawnerAutoEnterEnabled,
    isMonsterSpawnerItem,
    renderChestSpawnerMetadataRows,
    renderMonsterSpawnerActivationRows,
    renderMonsterSpawnerEditor,
    renderNpcMetadataRows,
    renderObjectMetadataRows,
    getUsecodeViewTarget
  };
}
