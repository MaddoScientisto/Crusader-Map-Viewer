const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const CHEST_ITEM_SPAWNER_SHAPE = 0x0476;
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const MONSTER_SPAWNER_SHAPE = 0x04d0;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;

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
