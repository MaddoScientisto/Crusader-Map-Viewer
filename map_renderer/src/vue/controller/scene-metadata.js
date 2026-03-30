const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const CHEST_ITEM_SPAWNER_SHAPE = 0x0476;
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const MONSTER_SPAWNER_SHAPE = 0x04d0;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;
const SKILLBOX_SHAPE = 0x04e3;
const CMD_LINK_SHAPE = 0x04b1;
const EVENT_SHAPE = 0x0361;
const DOOR_DEATH_HELPER_SHAPE = 0x04f8;
const STEAMBOX_SHAPE = 0x0500;
const ALARMHAT_SHAPE = 0x0561;
const ALRMTRIG_SHAPE = 0x0581;
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
      subcommandNote = "Uses nearby 0x0476 helper items and forwards through FREE.slot_30; this looks like a helper/spawn dispatch lane rather than a direct target-object edit.";
    } else if (subcommand === 1) {
      subcommandLabel = `Subcommand 1 (arg ${subcommandArg})`;
      subcommandNote = "Runs a target-local state change lane. In the self-targeting TRIGGER variants it only acts when the triggering item is the matched target; in the item-targeting variants it broadcasts across all matched nearby items.";
    } else if (subcommand === 2) {
      subcommandLabel = `Subcommand 2 (arg ${subcommandArg})`;
      subcommandNote = "Iterator lane present in TRIGGER, but the recovered body is still too incomplete to name the visible gameplay effect.";
    } else if (subcommand === 3) {
      subcommandLabel = `Subcommand 3 (arg ${subcommandArg})`;
      subcommandNote = "Dispatches TRIGGER.slot_22 onto matched targets; this is the clearest direct target-action lane in the recovered body.";
    } else if (subcommand === 4) {
      subcommandLabel = `Subcommand 4 (+${subcommandArg})`;
      subcommandNote = "Adds the arg value to the current link id before continuing the chain.";
    } else if (subcommand === 5) {
      subcommandLabel = `Subcommand 5 (-${subcommandArg})`;
      subcommandNote = "Subtracts the arg value from the current link id before continuing the chain.";
    } else if (subcommand === 6) {
      subcommandLabel = `Subcommand 6 (arg ${subcommandArg})`;
      subcommandNote = "Creation lane that again uses nearby 0x0476 helper items before calling Item.create on the resolved payload.";
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
    if (definition.shape === SKILLBOX_SHAPE) {
      return "SKILLBOX difficulty/skill gate; frame 0 and 1 switch trigger lanes by difficulty, and frame 2 remaps QLo before dispatch.";
    }
    if (definition.shape === CMD_LINK_SHAPE) {
      return "Trigger/link controller; TRIGGER reads QLo as the link id, uses mapNum low bits as phase and routing flags, and derives the target search shape from npcNum plus mapNum high bits.";
    }
    if (definition.shape === EVENT_SHAPE) {
      return "EVENT controller; a generic scripted event multiplexer that reuses QLo as a local link id and can drive triggers, doors, camera, audio, and nearby helper shapes.";
    }
    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      return "Door death/crush helper; DOOR.slot_23 scans nearby 0x04F8 items with matching QLo and dispatches trigger lane 0 or +0x80 by map-array state.";
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

  function renderSpecialEditorRows(item, definition = null) {
    if (!definition) {
      return "";
    }

    const rows = [];
    const rawQuality = Number.isInteger(item?.quality) ? (item.quality & 0xffff) : null;
    const qLo = rawQuality === null ? null : (rawQuality & 0xff);
    const qHi = rawQuality === null ? null : ((rawQuality >> 8) & 0xff);
    const rawMapNum = Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;

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

    if (definition.shape === DOOR_DEATH_HELPER_SHAPE) {
      rows.push("<dt>Decoded role</dt><dd>Door death/crush trigger helper.</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Door link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      if (rawMapNum !== null) {
        rows.push(`<dt>Lane select</dt><dd>${escapeHtml(`${rawMapNum} (${formatByteHex(rawMapNum)}): clear routes to trigger lane 0, nonzero routes to lane 0x80.`)}</dd>`);
      }
    }

    if (definition.shape === STEAMBOX_SHAPE) {
      rows.push("<dt>Decoded class</dt><dd>STEAMBOX</dd>");
      if (rawQuality !== null) {
        rows.push(`<dt>Steam link bytes</dt><dd>${escapeHtml(`QLo ${qLo} (${formatByteHex(qLo)}), QHi ${qHi} (${formatByteHex(qHi)}), raw ${formatWordHex(rawQuality)}`)}</dd>`);
      }
      rows.push("<dt>Steam note</dt><dd>Recovered STEAMBOX.equip matches nearby steam-family helpers by QLo and forwards them into event 0/1 control lanes.</dd>");
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
    renderObjectMetadataRows
  };
}
