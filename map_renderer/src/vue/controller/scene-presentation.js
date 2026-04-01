export function createScenePresentationController(deps) {
  const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
  const {
    state,
    context,
    viewport,
    canvas,
    overlayTooltip,
    inspectShapesCheckbox,
    includeEditorCheckbox,
    showEditorLinkArrowsCheckbox,
    alwaysShowRangesCheckbox,
    includeRoofsCheckbox,
    includeOobCheckbox,
    showBoundingBoxesCheckbox,
    showLinkArrowsCheckbox,
    showEggLabelsCheckbox,
    alwaysShowNpcPreviewsCheckbox,
    alwaysShowItemPreviewsCheckbox,
    monsterSpawnerFilterBlockedCheckbox,
    eggPlacementIdInput,
    eggPlacementWarning,
    eggList,
    eggEmpty,
    eggCount,
    monsterSpawnerList,
    monsterSpawnerEmpty,
    monsterSpawnerCount,
    hiddenList,
    hiddenEmpty,
    hiddenCount,
    setHiddenExportState,
    setStatus,
    showToast,
    clearTooltipState,
    setTooltipState,
    openEggEditModal,
    closeEggEditModal,
    saveCatalogEntry,
    saveTeleportEggId,
    saveMonsterSpawnerState,
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
    getUsecodeViewTarget,
    buildWarpCommand,
    canEditCatalog,
    escapeHtml,
    describeEggType,
    eyeIconSvg,
    renderPenIconSvg,
    formatEggId,
    formatNumericField,
    formatDiskCoords,
    formatWorldCoords,
    duplicateTeleportWarning,
    normalizeTeleportId,
    DEVICE_PIXEL_RATIO,
    EXPORT_BACKGROUND,
    EGG_FILTERS,
    getItemById,
    getShapeDefinition
  } = deps;

  if (typeof formatWorldCoords !== "function" || typeof formatDiskCoords !== "function") {
    throw new Error("Scene presentation controller requires formatWorldCoords and formatDiskCoords formatter helpers.");
  }

  let renderFrame = 0;
  const npcPreviewCanvasCache = new Map();
  const itemPreviewCanvasCache = new Map();
  let arrowGraphCache = null;
  const BOX_EW_SHAPE = 0x0080;
  const USECODE_TRIGGER_EGG_SHAPE = 0x0011;
  const FASTSKIL_SHAPE = 0x0120;
  const PANELNS_SHAPE = 0x00a1;
  const CARD_NS_SHAPE = 0x031d;
  const TELEPORTER_LIGHTS_SHAPE = 0x01db;
  const ELEVATOR_SHAPE = 0x021e;
  const EVENT_SHAPE = 0x0361;
  const SPANEL_SHAPE = 0x03aa;
  const FLAMEBOX_SHAPE = 0x0403;
  const CMD_LINK_SHAPE = 0x04b1;
  const SKILLBOX_SHAPE = 0x04e3;
  const BRO_BOOT_SHAPE = 0x04fe;
  const DOOR_DEATH_HELPER_SHAPE = 0x04f8;
  const STEAMBOX_SHAPE = 0x0500;
  const ALARMHAT_SHAPE = 0x0561;
  const ALRMTRIG_SHAPE = 0x0581;
  const MONSTER_SPAWNER_SHAPE = 0x04d0;
  const FLAME_HELPER_SHAPES = new Set([0x0438, 0x0439, 0x043a, 0x043b, 0x050a, 0x0518]);
  const STEAM_TARGET_SHAPES = new Set([0x03a9, 0x04f9, 0x04fa, 0x04fd, 0x0511]);
  const DOOR_TARGET_SHAPES = new Set([0x0005, 0x0046, 0x007b, 0x0095, 0x0099, 0x00a9, 0x030a, 0x030b, 0x03f8, 0x03ff]);
  const LIGHT_BLUE_ARROW_RGB = "148, 220, 255";
  const LOCAL_EDITOR_LINK_DISTANCE = 768;
  const LOCAL_ALARM_LINK_DISTANCE = 512;
  const LOCAL_DOOR_LINK_DISTANCE = 640;
  const CRUSADER_EGG_RANGE_WORLD_UNITS = 64;

  function hasWorldPosition(item) {
    return Boolean(
      item?.world
      && Number.isFinite(item.world.x)
      && Number.isFinite(item.world.y)
      && Number.isFinite(item.world.z)
    );
  }

  function getUsecodeTriggerEggRange(item) {
    if (getShapeNumber(item) !== USECODE_TRIGGER_EGG_SHAPE || item?.egg?.type !== "usecode-trigger" || !Number.isInteger(item?.npcNum)) {
      return null;
    }

    const rawNpcNum = item.npcNum & 0xff;
    return {
      rawNpcNum,
      xRange: (rawNpcNum >> 4) & 0x0f,
      yRange: rawNpcNum & 0x0f,
      worldXRange: ((rawNpcNum >> 4) & 0x0f) * CRUSADER_EGG_RANGE_WORLD_UNITS,
      worldYRange: (rawNpcNum & 0x0f) * CRUSADER_EGG_RANGE_WORLD_UNITS
    };
  }

  function projectUsecodeTriggerEggRange(item) {
    if (!state.current) {
      return null;
    }

    const range = getUsecodeTriggerEggRange(item);
    if (!range || !hasWorldPosition(item) || (range.worldXRange === 0 && range.worldYRange === 0)) {
      return null;
    }

    const minLeft = state.current.metadata.bounds.screenLeft;
    const minTop = state.current.metadata.bounds.screenTop;
    const centerX = item.world.x;
    const centerY = item.world.y;
    const left = centerX - range.worldXRange;
    const right = centerX + range.worldXRange;
    const top = centerY - range.worldYRange;
    const bottom = centerY + range.worldYRange;
    const projectPoint = (worldX, worldY, worldZ = item.world.z) => ({
      x: Math.trunc(worldX / 4 - worldY / 4) - minLeft,
      y: Math.trunc(worldX / 8 + worldY / 8 - worldZ) - minTop
    });

    const topPoint = projectPoint(left, top);
    const leftPoint = projectPoint(left, bottom);
    const bottomPoint = projectPoint(right, bottom);
    const rightPoint = projectPoint(right, top);
    const hitPolygon = [topPoint, leftPoint, bottomPoint, rightPoint];
    const xs = hitPolygon.map((point) => point.x);
    const ys = hitPolygon.map((point) => point.y);

    return {
      center: projectPoint(centerX, centerY),
      segments: [
        [topPoint.x, topPoint.y, rightPoint.x, rightPoint.y],
        [rightPoint.x, rightPoint.y, bottomPoint.x, bottomPoint.y],
        [bottomPoint.x, bottomPoint.y, leftPoint.x, leftPoint.y],
        [leftPoint.x, leftPoint.y, topPoint.x, topPoint.y]
      ],
      hitPolygon,
      bounds: {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys)
      }
    };
  }

  function sceneToViewportRect(item) {
    return {
      left: item.screen.left * state.zoom + state.offsetX,
      top: item.screen.top * state.zoom + state.offsetY,
      width: item.screen.width * state.zoom,
      height: item.screen.height * state.zoom
    };
  }

  function hideInspectHighlight() {
    const overlay = state.highlightOverlay;
    if (!overlay.geometry && !overlay.fallbackItem && overlay.alpha === 0 && overlay.targetAlpha === 0) {
      return;
    }
    if (overlay.targetAlpha === 0 && overlay.itemId === null) {
      return;
    }
    overlay.itemId = null;
    overlay.targetAlpha = 0;
    scheduleRender();
  }

  function getBoundingGeometry(item) {
    if (!item) {
      return null;
    }
    const definition = getShapeDefinition(item.shapeDefId);
    return projectBoundingBoxWireframe(item, definition);
  }

  function getRangeGeometry(item) {
    if (!item) {
      return null;
    }
    return projectUsecodeTriggerEggRange(item);
  }

  function showInspectHighlight(item) {
    const overlay = state.highlightOverlay;
    const geometry = getBoundingGeometry(item);
    const isSameItem = overlay.itemId === item.id;
    overlay.itemId = item.id;
    overlay.geometry = geometry;
    overlay.fallbackItem = geometry ? null : item;
    if (overlay.targetAlpha !== 1) {
      overlay.targetAlpha = 1;
    }
    if (!isSameItem) {
      overlay.alpha = 0;
      overlay.lastTimestamp = 0;
    }
  }

  function getItemDisplay(item) {
    const definition = getShapeDefinition(item.shapeDefId);
    return {
      definition,
      displayName: definition?.displayName || item.shapeDefId,
      description: definition?.description || "",
      shapeHex: definition?.shapeHex || "-",
      family: definition?.family ?? "-",
      kind: definition?.kind || item.kind
    };
  }

  function isEggItem(item) {
    return Boolean(item?.egg);
  }

  function getQualityLowByte(item) {
    return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
  }

  function getMapByte(item) {
    return Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null;
  }

  function getShapeNumber(item) {
    const definition = getShapeDefinition(item?.shapeDefId);
    return Number.isInteger(definition?.shape) ? definition.shape : null;
  }

  function getCmdLinkMetadata(item) {
    if (getShapeNumber(item) !== CMD_LINK_SHAPE || !Number.isInteger(item?.mapNum) || !Number.isInteger(item?.npcNum)) {
      return null;
    }

    const mapByte = item.mapNum & 0xff;
    const qLo = getQualityLowByte(item);
    const qHi = Number.isInteger(item?.quality) ? ((item.quality >> 8) & 0xff) : null;
    const targetCode = (((mapByte & 0xe0) * 8) + (item.npcNum & 0xff)) & 0x7ff;

    return {
      qLo,
      qHi,
      targetCode,
      targetKind: targetCode === 0x07ff ? "family-1" : targetCode === 0x07fe ? "family-6" : targetCode === 0 ? "zero" : "exact-shape",
      itemMode: Boolean(mapByte & 0x04),
      phaseLane: (mapByte & 0x08) ? 0 : 1,
      lowPriority: Boolean(mapByte & 0x10),
      subcommand: qHi === null ? null : (qHi & 0x07),
      subcommandArg: qHi === null ? null : (qHi >> 3)
    };
  }

  function getCmdLinkCandidates(item, byShape) {
    const metadata = getCmdLinkMetadata(item);
    if (!metadata || metadata.targetKind !== "exact-shape") {
      return [];
    }

    return (byShape.get(metadata.targetCode) ?? []).filter((candidate) => {
      if (candidate.id === item.id) {
        return false;
      }
      if (!isWithinLinkDistance(item, candidate, LOCAL_EDITOR_LINK_DISTANCE)) {
        return false;
      }
      if (metadata.qLo !== 0xff && getQualityLowByte(candidate) !== metadata.qLo) {
        return false;
      }
      return true;
    });
  }

  function invalidateArrowGraphCache() {
    arrowGraphCache = null;
  }

  function isWithinLinkDistance(left, right, maxDistance) {
    if (!left || !right || !hasWorldPosition(left) || !hasWorldPosition(right)) {
      return false;
    }
    return Math.hypot(left.world.x - right.world.x, left.world.y - right.world.y) <= maxDistance;
  }

  function pushUniqueLink(links, seenKeys, source, target, options) {
    if (!source || !target || source.id === target.id) {
      return;
    }
    const key = `${source.id}->${target.id}:${options.label}`;
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    links.push({ source, target, ...options });
  }

  function addItemToBucket(map, key, item) {
    if (!Number.isInteger(key)) {
      return;
    }
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
      return;
    }
    map.set(key, [item]);
  }

  function getFastSkillArrowVariants(item) {
    const qLo = getQualityLowByte(item);
    if (!Number.isInteger(qLo)) {
      return [];
    }
    if (item?.frame === 2) {
      return [
        { qLo, labelPrefix: "FASTSKIL diff1" },
        { qLo: (qLo + 1) & 0xff, labelPrefix: "FASTSKIL diff2" },
        { qLo: (qLo + 2) & 0xff, labelPrefix: "FASTSKIL diff3+" }
      ];
    }
    return [{ qLo, labelPrefix: "FASTSKIL" }];
  }

  function getBoxEwArrowVariants(item) {
    const qLo = getQualityLowByte(item);
    if (!Number.isInteger(qLo) || item?.frame !== 0) {
      return [];
    }
    return [{ qLo, labelPrefix: "BOX_EW" }];
  }

  function getTeleportLinkMetadata(item) {
    if (!item) {
      return null;
    }

    if (Number.isInteger(item.egg?.labelId)) {
      if (item.egg?.type === "teleporter" || item.egg?.type === "teleport-destination") {
        return {
          type: item.egg.type,
          labelId: item.egg.labelId,
          evidence: "egg"
        };
      }
    }

    const definition = getShapeDefinition(item.shapeDefId);
    // Retail Remorse and Regret both use 0x01DB placements as non-egg teleporter carriers.
    // Frame 1 covers the previously confirmed teleporter-lights lane, while Regret map 3 also
    // uses colocated frame 0 records that hold the actual destination id in quality.
    if (definition?.shape === TELEPORTER_LIGHTS_SHAPE && (item.frame === 0 || item.frame === 1) && Number.isInteger(item.quality)) {
      return {
        type: "teleporter",
        labelId: item.quality & 0xff,
        evidence: item.frame === 1 ? "teleporter-lights" : "telepad"
      };
    }

    return null;
  }

  function getElevatorLinkMetadata(item) {
    if (!item) {
      return null;
    }

    const definition = getShapeDefinition(item.shapeDefId);
    if (definition?.shape !== ELEVATOR_SHAPE || item.frame !== 0 || !Number.isInteger(item.quality)) {
      return null;
    }

    const qlo = item.quality & 0xff;
    if (qlo >= 1 && qlo <= 0x0f) {
      return {
        labelId: qlo,
        evidence: "elevator-qlo"
      };
    }

    if (qlo === 0x10) {
      return {
        labelId: 4,
        evidence: "elevator-qlo-special"
      };
    }

    return null;
  }

  function setEggPlacementWarning(message) {
    eggPlacementWarning.hidden = !message;
    eggPlacementWarning.textContent = message;
  }

  function getRequestedPlacementTeleportId() {
    try {
      return normalizeTeleportId(eggPlacementIdInput.value);
    } catch {
      return null;
    }
  }

  function updateMonsterSpawnerListSelection() {
    monsterSpawnerList.querySelectorAll("[data-monster-spawner-item-id]").forEach((button) => {
      button.classList.toggle("is-selected", button.getAttribute("data-monster-spawner-item-id") === state.pinnedItemId);
    });
  }

  function getFilteredMonsterSpawners() {
    const spawners = getMonsterSpawnerItems();
    if (!monsterSpawnerFilterBlockedCheckbox.checked) {
      return spawners;
    }
    return spawners.filter((item) => !isMonsterSpawnerAutoEnterEnabled(item));
  }

  function centerViewportOnScenePoint(sceneX, sceneY) {
    state.offsetX = viewport.clientWidth / 2 - sceneX * state.zoom;
    state.offsetY = viewport.clientHeight / 2 - sceneY * state.zoom;
    deps.clampOffsets();
  }

  function centerViewportOnItem(item) {
    centerViewportOnScenePoint(item.screen.anchorX, item.screen.anchorY);
  }

  function renderMonsterSpawnerList() {
    if (!state.current) {
      monsterSpawnerList.innerHTML = "";
      monsterSpawnerEmpty.hidden = false;
      monsterSpawnerEmpty.textContent = "Select a map to list its 0x04D0 spawners.";
      monsterSpawnerCount.textContent = "0";
      return;
    }

    const spawners = getFilteredMonsterSpawners();
    monsterSpawnerList.innerHTML = "";
    monsterSpawnerCount.textContent = String(spawners.length);
    monsterSpawnerEmpty.hidden = spawners.length > 0;
    if (!getMonsterSpawnerItems().length) {
      monsterSpawnerEmpty.textContent = "No 0x04D0 spawners were found in this map.";
      return;
    }
    if (!spawners.length) {
      monsterSpawnerEmpty.textContent = "No 0x04D0 spawners match the current filter.";
      return;
    }

    for (const item of spawners) {
      const npcInfo = getNpcSpawnerInfoForItem(item, getShapeDefinition(item.shapeDefId));
      const signalKey = getMonsterSpawnerSignalKey(item);
      const mode = item.frame === 0
        ? (isMonsterSpawnerAutoEnterEnabled(item) ? "Auto" : "Blocked")
        : `Frame ${item.frame}`;
      const npcLabel = npcInfo
        ? `${item.npcNum} (${npcInfo.name})`
        : `NPC ${formatNumericField(item.npcNum)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "egg-item-button";
      button.setAttribute("data-monster-spawner-item-id", item.id);
      button.innerHTML = `
        <div class="egg-item-title-row">
          <span class="egg-item-id">${escapeHtml(item.id)}</span>
          <span class="egg-item-badge">${escapeHtml(mode)}</span>
        </div>
        <div class="egg-item-meta">${escapeHtml(`${npcLabel} · QLo ${formatNumericField(signalKey)} · world ${formatWorldCoords(item)}`)}</div>
      `;
      button.addEventListener("click", () => {
        centerViewportOnItem(item);
        state.pinnedItemId = item.id;
        state.hoverItemId = null;
        syncOverlayState();
        updateMonsterSpawnerListSelection();
        scheduleRender();
      });
      monsterSpawnerList.append(button);
    }

    updateMonsterSpawnerListSelection();
  }

  function updateEggListSelection() {
    eggList.querySelectorAll("[data-egg-item-id]").forEach((button) => {
      button.classList.toggle("is-selected", button.getAttribute("data-egg-item-id") === state.pinnedItemId);
    });
  }

  function isEggTypeEnabled(eggType) {
    const filter = EGG_FILTERS.find((entry) => entry.type === eggType);
    return filter ? filter.checkbox.checked : true;
  }

  function getFilteredEggs() {
    if (!state.current) {
      return [];
    }
    return state.current.eggs.filter((item) => isEggTypeEnabled(item.egg?.type));
  }

  function renderEggList() {
    if (!state.current) {
      eggList.innerHTML = "";
      eggEmpty.hidden = false;
      eggEmpty.textContent = "Select a map to list its eggs.";
      eggCount.textContent = "0";
      return;
    }

    const eggs = getFilteredEggs();
    eggList.innerHTML = "";
    eggCount.textContent = String(eggs.length);
    eggEmpty.hidden = eggs.length > 0;
    if (!state.current.eggs.length) {
      eggEmpty.textContent = "No egg-family items were found in this map.";
      return;
    }
    if (!eggs.length) {
      eggEmpty.textContent = "No eggs match the current category filters.";
      return;
    }

    for (const item of eggs) {
      const display = getItemDisplay(item);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "egg-item-button";
      button.setAttribute("data-egg-item-id", item.id);
      button.innerHTML = `
        <div class="egg-item-title-row">
          <span class="egg-item-id">${escapeHtml(formatEggId(item.egg.labelId))}</span>
          <span class="egg-item-badge">${escapeHtml(describeEggType(item.egg))}</span>
        </div>
        <div class="egg-item-meta">world ${escapeHtml(formatWorldCoords(item))} · shape ${escapeHtml(display.shapeHex)}</div>
      `;
      button.addEventListener("click", () => {
        centerViewportOnItem(item);
        state.pinnedItemId = item.id;
        state.hoverItemId = null;
        syncOverlayState();
        updateEggListSelection();
        scheduleRender();
      });
      eggList.append(button);
    }

    updateEggListSelection();
  }

  function isItemVisible(item) {
    if (!state.current || state.current.hiddenIds.has(item.id)) {
      return false;
    }
    const definition = getShapeDefinition(item.shapeDefId);
    if (!definition) {
      return true;
    }
    if (!includeEditorCheckbox.checked && definition.traits?.editor) {
      return false;
    }
    if (!includeRoofsCheckbox.checked && definition.traits?.roof) {
      return false;
    }
    if (!includeOobCheckbox.checked && definition.traits?.oob) {
      return false;
    }
    return true;
  }

  function isEditorSelectableItem(item) {
    if (!item || !includeEditorCheckbox.checked) {
      return false;
    }
    const definition = getShapeDefinition(item.shapeDefId);
    return Boolean(definition?.traits?.editor);
  }

  function canPinItem(item) {
    return Boolean(item) && (inspectShapesCheckbox.checked || isEditorSelectableItem(item) || isEggItem(item));
  }

  function canKeepPinnedItemVisible() {
    const item = getItemById(state.pinnedItemId);
    return isEditorSelectableItem(item) || isEggItem(item);
  }

  function canKeepHoverItemVisible() {
    const item = getItemById(state.hoverItemId);
    return isEditorSelectableItem(item) || isEggItem(item);
  }

  function getFocusedItem() {
    if (!state.current) {
      return null;
    }
    if (state.pinnedItemId) {
      return getItemById(state.pinnedItemId);
    }
    if (state.hoverItemId) {
      return getItemById(state.hoverItemId);
    }
    return null;
  }

  function getItemSpriteData(item) {
    if (!state.current) {
      return null;
    }
    const sprite = state.current.spriteIndex.get(item.spriteId);
    const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
    if (!sprite || !atlas) {
      return null;
    }
    return { sprite, atlas };
  }

  function getPreviewSpriteData(preview) {
    if (!state.current || !preview?.spriteId) {
      return null;
    }
    const sprite = state.current.spriteIndex.get(preview.spriteId);
    const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
    if (!sprite || !atlas) {
      return null;
    }
    return { sprite, atlas };
  }

  function getTooltipPreviewSpriteData(item) {
    return getPreviewSpriteData(item?.itemPreview) ?? getPreviewSpriteData(item?.npcPreview) ?? getItemSpriteData(item);
  }

  function drawTooltipPreview(canvasElement, item) {
    const previewContext = canvasElement.getContext("2d", { alpha: true });
    if (!previewContext) {
      return;
    }

    const previewSize = 112;
    canvasElement.width = Math.round(previewSize * DEVICE_PIXEL_RATIO);
    canvasElement.height = Math.round(previewSize * DEVICE_PIXEL_RATIO);
    previewContext.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
    previewContext.clearRect(0, 0, previewSize, previewSize);
    previewContext.imageSmoothingEnabled = false;

    const linkedPreview = getPreviewSpriteData(item?.itemPreview) ?? getPreviewSpriteData(item?.npcPreview);
    const spriteData = linkedPreview ?? getItemSpriteData(item);
    if (!spriteData) {
      previewContext.fillStyle = "rgba(176, 197, 212, 0.22)";
      previewContext.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      previewContext.textAlign = "center";
      previewContext.textBaseline = "middle";
      previewContext.fillText("No preview", previewSize / 2, previewSize / 2);
      return;
    }

    const { sprite, atlas } = spriteData;
    const fitScale = Math.min((previewSize - 16) / Math.max(sprite.width, 1), (previewSize - 16) / Math.max(sprite.height, 1));
    const scale = fitScale >= 1 ? Math.max(1, Math.floor(fitScale)) : fitScale;
    const width = sprite.width * scale;
    const height = sprite.height * scale;
    const left = (previewSize - width) / 2;
    const top = (previewSize - height) / 2;

    previewContext.globalAlpha = linkedPreview ? 1 : (item.presentation?.opacity ?? 1);
    if (item.flags.flipped) {
      previewContext.save();
      previewContext.translate(left + width, top);
      previewContext.scale(-1, 1);
      previewContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, width, height);
      previewContext.restore();
    } else {
      previewContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, left, top, width, height);
    }
    previewContext.globalAlpha = 1;
  }

  function renderTooltip(item) {
    const isPinnedTooltip = state.pinnedItemId === item.id;
    const hidden = state.current?.hiddenIds.has(item.id) ?? false;
    const display = getItemDisplay(item);
    const npcRows = renderNpcMetadataRows(item, display.definition);
    const chestRows = renderChestSpawnerMetadataRows(item, display.definition);
    const spawnerRows = renderMonsterSpawnerActivationRows(item, display.definition);
    const objectRows = renderObjectMetadataRows(item, display.definition);
    const monsterSpawnerEditor = renderMonsterSpawnerEditor(item, display.definition);
    const usecodeTarget = getUsecodeViewTarget(item, display.definition);
    const catalogEntry = display.definition?.catalogEntry ?? null;
    const showCatalogEditor = canEditCatalog() && isPinnedTooltip && display.definition;
    const showTeleportEggEditor = isPinnedTooltip && isEggItem(item) && ["teleporter", "teleport-destination"].includes(item.egg?.type);
    const showPinnedActions = isPinnedTooltip;
    const warpCommand = buildWarpCommand(item);
    const eggRows = item.egg
      ? `
        <dt>Egg type</dt><dd>${escapeHtml(describeEggType(item.egg))}</dd>
        <dt>Egg ID</dt><dd>${escapeHtml(formatEggId(item.egg.labelId))}</dd>
      `
      : "";
    const notes = item.notes.length ? `<ul class="tooltip-notes">${item.notes.map((note) => `<li>${note}</li>`).join("")}</ul>` : "";
    const metadataRows = `
      <dt>Shape</dt><dd>${escapeHtml(display.shapeHex)} frame ${escapeHtml(item.frame)}</dd>
      <dt>Kind</dt><dd>${escapeHtml(display.kind)}</dd>
      <dt>Family</dt><dd>${escapeHtml(display.family)}</dd>
      <dt>World</dt><dd>${escapeHtml(formatWorldCoords(item))}</dd>
      <dt>Disk</dt><dd>${escapeHtml(formatDiskCoords(item))}</dd>
      <dt>Source</dt><dd>${escapeHtml(item.source)}</dd>
      <dt>Flags</dt><dd>${escapeHtml(item.flags.hex)}</dd>
      ${eggRows}
      ${npcRows}
      ${chestRows}
      ${spawnerRows}
      ${objectRows}
    `;
    overlayTooltip.classList.toggle("is-pinned", isPinnedTooltip);
    overlayTooltip.classList.toggle("is-hover", !isPinnedTooltip);

    setTooltipState({
      visible: true,
      pinned: isPinnedTooltip,
      hover: !isPinnedTooltip,
      hidden,
      item,
      itemLabel: item.label,
      displayName: display.displayName,
      displayDescription: display.description,
      metadataRowsHtml: metadataRows,
      notesHtml: notes,
      monsterSpawnerEditorHtml: isPinnedTooltip || showCatalogEditor ? monsterSpawnerEditor : "",
      showCatalogEditor,
      showTeleportEggEditor,
      showPinnedActions,
      usecodeTarget,
      warpCommand: isPinnedTooltip ? warpCommand : "",
      catalogEntry,
      eyeIconSvg: eyeIconSvg(hidden),
      penIconSvg: renderPenIconSvg(),
      onToggleHidden: () => {
        deps.toggleHidden(item.id);
      },
      onSaveCatalog: async (payload) => {
        await saveCatalogEntry(item, payload);
      },
      onEditEgg: () => {
        openEggEditModal(item, duplicateTeleportWarning(state.current?.eggs ?? [], item.egg?.labelId, item.id), {
          onSubmit: ({ itemId, teleportId }) => {
            const targetItem = getItemById(itemId);
            if (!targetItem) {
              closeEggEditModal();
              return;
            }
            try {
              saveTeleportEggId(targetItem, { elements: { teleportId: { value: teleportId } } });
              closeEggEditModal();
            } catch (error) {
              setStatus(error instanceof Error ? error.message : String(error));
            }
          },
          onValidate: ({ itemId, teleportId }) => duplicateTeleportWarning(state.current?.eggs ?? [], normalizeTeleportId(teleportId), itemId || null)
        });
      },
      onOpenUsecode: () => {
        if (!usecodeTarget) {
          return;
        }
        window.dispatchEvent(new CustomEvent(OPEN_USECODE_TARGET_EVENT, {
          detail: {
            ...usecodeTarget,
            itemId: item.id,
            itemLabel: item.label,
            displayName: display.displayName
          }
        }));
      },
      onCopyWarpCommand: async () => {
        if (!warpCommand) {
          return;
        }
        try {
          await navigator.clipboard.writeText(warpCommand);
          showToast("Warp command copied.");
          setStatus("Warp command copied to clipboard.");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Failed to copy warp command.");
        }
      },
      onSaveMonsterSpawner: (root) => {
        saveMonsterSpawnerState(item, root ?? overlayTooltip, display.definition);
      }
    });
    overlayTooltip.hidden = false;
  }

  function positionTooltipForItem(item) {
    if (state.pinnedItemId === item.id) {
      overlayTooltip.style.left = "auto";
      overlayTooltip.style.right = "16px";
      overlayTooltip.style.top = "16px";
      overlayTooltip.style.bottom = "16px";
      return;
    }

    const rect = sceneToViewportRect(item);
    const tooltipWidth = overlayTooltip.offsetWidth;
    const tooltipHeight = overlayTooltip.offsetHeight;
    const padding = 18;
    let left = rect.left + rect.width + 16;
    let top = rect.top + Math.min(rect.height / 2, 48);

    if (left + tooltipWidth + padding > viewport.clientWidth) {
      left = Math.max(padding, rect.left - tooltipWidth - 16);
    }
    if (top + tooltipHeight + padding > viewport.clientHeight) {
      top = Math.max(padding, viewport.clientHeight - tooltipHeight - padding);
    }
    if (top < padding) {
      top = padding;
    }

    overlayTooltip.style.left = `${left}px`;
    overlayTooltip.style.top = `${top}px`;
    overlayTooltip.style.right = "auto";
    overlayTooltip.style.bottom = "auto";
  }

  function hideOverlayTooltip() {
    overlayTooltip.hidden = true;
    clearTooltipState();
  }

  function updateHiddenList() {
    if (!state.current) {
      hiddenList.innerHTML = "";
      hiddenEmpty.hidden = false;
      if (hiddenCount) {
        hiddenCount.textContent = "0";
      }
      renderEggList();
      return;
    }

    const hiddenItems = [...state.current.hiddenIds].map((itemId) => getItemById(itemId)).filter(Boolean);
    hiddenEmpty.hidden = hiddenItems.length > 0;
    if (hiddenCount) {
      hiddenCount.textContent = String(hiddenItems.length);
    }
    hiddenList.innerHTML = "";

    for (const item of hiddenItems) {
      const display = getItemDisplay(item);
      const row = document.createElement("div");
      row.className = "hidden-item";
      const title = document.createElement("div");
      title.className = "hidden-item-title";
      title.textContent = display.displayName;
      const meta = document.createElement("div");
      meta.className = "hidden-item-meta";
      meta.textContent = `${display.shapeHex} · ${item.id}`;
      const button = document.createElement("button");
      button.className = "hidden-item-button";
      button.type = "button";
      button.textContent = "Restore";
      button.addEventListener("click", () => deps.toggleHidden(item.id, false));
      row.append(title, meta, button);
      hiddenList.append(row);
    }

    setHiddenExportState(hiddenItems.length > 0);
  }

  function syncOverlayState() {
    if (state.eggPlacement) {
      hideInspectHighlight();
      hideOverlayTooltip();
      updateEggListSelection();
      updateMonsterSpawnerListSelection();
      return;
    }
    if (!inspectShapesCheckbox.checked && !canKeepPinnedItemVisible() && !canKeepHoverItemVisible()) {
      hideInspectHighlight();
      hideOverlayTooltip();
      updateEggListSelection();
      updateMonsterSpawnerListSelection();
      return;
    }
    const item = getFocusedItem();
    if (!item || (!isItemVisible(item) && !isEggItem(item))) {
      hideInspectHighlight();
      hideOverlayTooltip();
      updateEggListSelection();
      updateMonsterSpawnerListSelection();
      return;
    }
    showInspectHighlight(item);
    renderTooltip(item);
    positionTooltipForItem(item);
    updateEggListSelection();
    updateMonsterSpawnerListSelection();
  }

  function scheduleRender() {
    if (renderFrame) {
      return;
    }
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      renderScene();
    });
  }

  function drawSceneItemSprite(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, item, opacityOverride = null) {
    if (!state.current) {
      return;
    }
    const sprite = state.current.spriteIndex.get(item.spriteId);
    const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
    if (!sprite || !atlas) {
      return;
    }

    const left = item.screen.left * scale + offsetX;
    const top = item.screen.top * scale + offsetY;
    const width = item.screen.width * scale;
    const height = item.screen.height * scale;
    if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
      return;
    }

    targetContext.globalAlpha = opacityOverride ?? item.presentation.opacity ?? 1;
    if (item.flags.flipped) {
      targetContext.save();
      targetContext.translate(left + width, top);
      targetContext.scale(-1, 1);
      targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, width, height);
      targetContext.restore();
    } else {
      targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, left, top, width, height);
    }
  }

  function drawSceneToContext(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, hiddenIds = new Set()) {
    targetContext.save();
    targetContext.fillStyle = EXPORT_BACKGROUND;
    targetContext.fillRect(0, 0, canvasWidth, canvasHeight);
    targetContext.imageSmoothingEnabled = false;

    if (!state.current) {
      targetContext.restore();
      return;
    }

    for (const item of state.current.scene.items) {
      if (hiddenIds.has(item.id) || !isItemVisible(item)) {
        continue;
      }
      drawSceneItemSprite(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, item);
    }

    targetContext.globalAlpha = 1;
    targetContext.restore();
  }

  function getVisibleNpcPreviewItems() {
    if (!state.current) {
      return [];
    }

    return state.current.scene.items.filter((item) => (
      item?.npcPreview
      && isItemVisible(item)
      && !state.current.hiddenIds.has(item.id)
      && includeEditorCheckbox.checked
      && (alwaysShowNpcPreviewsCheckbox.checked || item.id === state.pinnedItemId || item.id === state.hoverItemId)
    ));
  }

  function getVisibleItemPreviewItems() {
    if (!state.current) {
      return [];
    }

    return state.current.scene.items.filter((item) => (
      item?.itemPreview
      && isItemVisible(item)
      && !state.current.hiddenIds.has(item.id)
      && includeEditorCheckbox.checked
      && (alwaysShowItemPreviewsCheckbox.checked || item.id === state.pinnedItemId || item.id === state.hoverItemId)
    ));
  }

  function getTintedPreviewGhost(cache, sprite, atlas, fillStyle) {
    const cacheKey = `${fillStyle}:${sprite.id}:${sprite.atlasId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const source = document.createElement("canvas");
    source.width = sprite.width;
    source.height = sprite.height;
    const sourceContext = source.getContext("2d", { alpha: true });
    sourceContext.imageSmoothingEnabled = false;
    sourceContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);

    const tint = document.createElement("canvas");
    tint.width = sprite.width;
    tint.height = sprite.height;
    const tintContext = tint.getContext("2d", { alpha: true });
    tintContext.imageSmoothingEnabled = false;
    tintContext.drawImage(source, 0, 0);
    tintContext.globalCompositeOperation = "source-in";
    tintContext.fillStyle = fillStyle;
    tintContext.fillRect(0, 0, tint.width, tint.height);

    const outlinePadding = 1;
    const outline = document.createElement("canvas");
    outline.width = sprite.width + outlinePadding * 2;
    outline.height = sprite.height + outlinePadding * 2;
    const outlineContext = outline.getContext("2d", { alpha: true });
    outlineContext.imageSmoothingEnabled = false;
    const offsets = [
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2]
    ];
    for (const [x, y] of offsets) {
      outlineContext.globalAlpha = 0.55;
      outlineContext.drawImage(tint, x, y);
    }
    outlineContext.globalAlpha = 1;
    outlineContext.drawImage(tint, outlinePadding, outlinePadding);

    const ghost = { source, outline, outlinePadding };
    cache.set(cacheKey, ghost);
    return ghost;
  }

  function getNpcPreviewGhost(sprite, atlas) {
    return getTintedPreviewGhost(npcPreviewCanvasCache, sprite, atlas, "rgba(92, 181, 255, 1)");
  }

  function getItemPreviewGhost(sprite, atlas) {
    return getTintedPreviewGhost(itemPreviewCanvasCache, sprite, atlas, "rgba(244, 197, 84, 1)");
  }

  function drawNpcPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    const items = getVisibleNpcPreviewItems();
    if (!items.length) {
      return;
    }

    targetContext.save();
    targetContext.imageSmoothingEnabled = false;

    for (const item of items) {
      const preview = item.npcPreview;
      const sprite = state.current.spriteIndex.get(preview.spriteId) ?? null;
      const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
      if (!sprite || !atlas) {
        continue;
      }

      const ghost = getNpcPreviewGhost(sprite, atlas);
      const width = sprite.width * scale;
      const height = sprite.height * scale;
      const centerX = item.screen.anchorX * scale + offsetX;
      const top = item.screen.top * scale + offsetY - height - Math.max(6, scale * 4);
      const left = centerX - width / 2;
      if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
        continue;
      }

      const selected = item.id === state.pinnedItemId;
      const hovered = item.id === state.hoverItemId;
      const outlinePad = ghost.outlinePadding * scale;
      targetContext.globalAlpha = selected ? 0.88 : hovered ? 0.8 : 0.72;
      targetContext.drawImage(
        ghost.outline,
        left - outlinePad,
        top - outlinePad,
        (sprite.width + ghost.outlinePadding * 2) * scale,
        (sprite.height + ghost.outlinePadding * 2) * scale
      );
      targetContext.globalAlpha = selected ? 0.42 : hovered ? 0.38 : 0.34;
      targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, left, top, width, height);
    }

    targetContext.restore();
  }

  function drawItemPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    const items = getVisibleItemPreviewItems();
    if (!items.length) {
      return;
    }

    targetContext.save();
    targetContext.imageSmoothingEnabled = false;

    for (const item of items) {
      const preview = item.itemPreview;
      const sprite = state.current.spriteIndex.get(preview.spriteId) ?? null;
      const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
      if (!sprite || !atlas) {
        continue;
      }

      const ghost = getItemPreviewGhost(sprite, atlas);
      const width = sprite.width * scale;
      const height = sprite.height * scale;
      const centerX = item.screen.anchorX * scale + offsetX;
      const top = item.screen.top * scale + offsetY - height - Math.max(6, scale * 4);
      const left = centerX - width / 2;
      if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
        continue;
      }

      const selected = item.id === state.pinnedItemId;
      const hovered = item.id === state.hoverItemId;
      const outlinePad = ghost.outlinePadding * scale;
      targetContext.globalAlpha = selected ? 0.88 : hovered ? 0.8 : 0.72;
      targetContext.drawImage(
        ghost.outline,
        left - outlinePad,
        top - outlinePad,
        (sprite.width + ghost.outlinePadding * 2) * scale,
        (sprite.height + ghost.outlinePadding * 2) * scale
      );
      targetContext.globalAlpha = selected ? 0.42 : hovered ? 0.38 : 0.34;
      targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, left, top, width, height);
    }

    targetContext.restore();
  }

  function getItemLinkPoint(item) {
    return {
      x: item.screen.anchorX,
      y: item.screen.top + item.screen.height / 2
    };
  }

  function isDrawableLinkItem(item) {
    if (!item || !state.current) {
      return false;
    }
    if (state.current.hiddenIds.has(item.id)) {
      return false;
    }
    return isItemVisible(item) || Boolean(getTeleportLinkMetadata(item)) || Boolean(getElevatorLinkMetadata(item)) || isEggItem(item);
  }

  function buildTeleportArrowLinks(visibleItems) {
    const teleportersById = new Map();
    const destinationsById = new Map();
    for (const item of visibleItems) {
      const teleportLink = getTeleportLinkMetadata(item);
      if (!Number.isInteger(teleportLink?.labelId)) {
        continue;
      }
      const bucket = teleportLink.type === "teleporter"
        ? teleportersById
        : teleportLink.type === "teleport-destination"
          ? destinationsById
          : null;
      if (!bucket) {
        continue;
      }
      const existing = bucket.get(teleportLink.labelId) ?? [];
      existing.push(item);
      bucket.set(teleportLink.labelId, existing);
    }

    const links = [];
    for (const [labelId, teleporters] of teleportersById.entries()) {
      const destinations = destinationsById.get(labelId) ?? [];
      for (const source of teleporters) {
        for (const target of destinations) {
          links.push({
            source,
            target,
            color: "rgba(232, 184, 78, 0.94)",
            dashed: [],
            label: `Teleport ${labelId}`
          });
        }
      }
    }
    return links;
  }

  function buildElevatorArrowLinks(visibleItems) {
    const elevatorsById = new Map();
    const destinationsById = new Map();
    for (const item of visibleItems) {
      const elevatorLink = getElevatorLinkMetadata(item);
      const teleportLink = getTeleportLinkMetadata(item);
      if (Number.isInteger(elevatorLink?.labelId)) {
        const existing = elevatorsById.get(elevatorLink.labelId) ?? [];
        existing.push(item);
        elevatorsById.set(elevatorLink.labelId, existing);
      }
      if (teleportLink?.type === "teleport-destination" && Number.isInteger(teleportLink.labelId)) {
        const existing = destinationsById.get(teleportLink.labelId) ?? [];
        existing.push(item);
        destinationsById.set(teleportLink.labelId, existing);
      }
    }

    const links = [];
    for (const [labelId, elevators] of elevatorsById.entries()) {
      const destinations = destinationsById.get(labelId) ?? [];
      for (const source of elevators) {
        for (const target of destinations) {
          links.push({
            source,
            target,
            color: "rgba(124, 210, 135, 0.94)",
            dashed: [6, 4],
            label: `Elevator ${labelId}`
          });
        }
      }
    }
    return links;
  }

  function buildEditorHelperArrowLinks(visibleItems, byShape) {
    const links = [];
    const seenKeys = new Set();
    const controllerTargets = byShape.get(CMD_LINK_SHAPE) ?? [];
    const monsterSpawnerTargets = (byShape.get(MONSTER_SPAWNER_SHAPE) ?? []).filter((item) => item.frame === 0);
    const controllerTargetsByQlo = new Map();
    const controllerTargetsByMapByte = new Map();

    const buildQloIndexForShapes = (shapes) => {
      const index = new Map();
      for (const shape of shapes) {
        for (const item of byShape.get(shape) ?? []) {
          addItemToBucket(index, getQualityLowByte(item), item);
        }
      }
      return index;
    };

    for (const target of controllerTargets) {
      addItemToBucket(controllerTargetsByQlo, getQualityLowByte(target), target);
      addItemToBucket(controllerTargetsByMapByte, getMapByte(target), target);
    }

    const doorTargetsByQlo = buildQloIndexForShapes(DOOR_TARGET_SHAPES);
    const spanelTargetsByQlo = buildQloIndexForShapes(new Set([SPANEL_SHAPE]));
    const steamTargetsByQlo = buildQloIndexForShapes(STEAM_TARGET_SHAPES);
    const flameTargetsByQlo = buildQloIndexForShapes(FLAME_HELPER_SHAPES);

    for (const source of byShape.get(CMD_LINK_SHAPE) ?? []) {
      const metadata = getCmdLinkMetadata(source);
      if (!metadata) {
        continue;
      }
      const targets = getCmdLinkCandidates(source, byShape);
      for (const target of targets) {
        const targetShape = getShapeNumber(target);
        const priorityDash = metadata.lowPriority ? [2, 6] : [6, 3];
        const actionLabel = metadata.subcommand === null
          ? "cmd"
          : metadata.subcommand === 0
            ? `cmd helper ${metadata.subcommandArg}`
            : metadata.subcommand === 1
              ? `cmd state ${metadata.subcommandArg}`
            : metadata.subcommand === 3
              ? `cmd pulse ${metadata.subcommandArg}`
              : metadata.subcommand === 4
                ? `cmd link +${metadata.subcommandArg}`
                : metadata.subcommand === 5
                  ? `cmd link -${metadata.subcommandArg}`
                  : metadata.subcommand === 6
                    ? `cmd create ${metadata.subcommandArg}`
              : `cmd sub ${metadata.subcommand}`;
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(38, 70, 83, 0.92)",
          dashed: priorityDash,
          label: `${actionLabel} -> ${targetShape === null ? "target" : `0x${targetShape.toString(16).padStart(3, "0")}`} QLo ${metadata.qLo}`
        });
      }
    }

    for (const source of byShape.get(ALARMHAT_SHAPE) ?? []) {
      for (const target of monsterSpawnerTargets) {
        if (!isWithinLinkDistance(source, target, LOCAL_ALARM_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: `rgba(${LIGHT_BLUE_ARROW_RGB}, 0.92)`,
          dashed: [5, 4],
          label: "ALARMHAT local alarm"
        });
      }
    }

    for (const source of byShape.get(DOOR_DEATH_HELPER_SHAPE) ?? []) {
      const sourceQlo = getQualityLowByte(source);
      if (!Number.isInteger(sourceQlo)) {
        continue;
      }
      for (const target of doorTargetsByQlo.get(sourceQlo) ?? []) {
        if (!isWithinLinkDistance(source, target, LOCAL_DOOR_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(230, 111, 81, 0.9)",
          dashed: [3, 4],
          label: `Destroyable door QLo ${sourceQlo}`
        });
      }
    }

    for (const source of byShape.get(STEAMBOX_SHAPE) ?? []) {
      const sourceQlo = getQualityLowByte(source);
      if (!Number.isInteger(sourceQlo)) {
        continue;
      }
      for (const target of steamTargetsByQlo.get(sourceQlo) ?? []) {
        if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(78, 205, 196, 0.9)",
          dashed: [8, 4],
          label: `STEAMBOX QLo ${sourceQlo}`
        });
      }
    }

    for (const source of byShape.get(FLAMEBOX_SHAPE) ?? []) {
      const sourceQlo = getQualityLowByte(source);
      if (!Number.isInteger(sourceQlo)) {
        continue;
      }
      for (const target of flameTargetsByQlo.get(sourceQlo) ?? []) {
        if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(231, 111, 81, 0.9)",
          dashed: [7, 3],
          label: `FLAMEBOX QLo ${sourceQlo}`
        });
      }
    }

    for (const source of byShape.get(BRO_BOOT_SHAPE) ?? []) {
      const sourceQlo = getQualityLowByte(source);
      if (!Number.isInteger(sourceQlo)) {
        continue;
      }
      for (const target of spanelTargetsByQlo.get(sourceQlo) ?? []) {
        if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(138, 177, 125, 0.9)",
          dashed: [5, 5],
          label: `BRO_BOOT QLo ${sourceQlo}`
        });
      }
    }

    const controllerShapes = new Set([BOX_EW_SHAPE, FASTSKIL_SHAPE, EVENT_SHAPE, SKILLBOX_SHAPE, PANELNS_SHAPE, CARD_NS_SHAPE, SPANEL_SHAPE]);
    for (const source of visibleItems) {
      const sourceShape = getShapeNumber(source);
      if (!controllerShapes.has(sourceShape)) {
        continue;
      }
      const sourceQlo = getQualityLowByte(source);
      if (!Number.isInteger(sourceQlo)) {
        continue;
      }
      const controllerVariants = sourceShape === FASTSKIL_SHAPE
        ? getFastSkillArrowVariants(source)
        : sourceShape === BOX_EW_SHAPE
          ? getBoxEwArrowVariants(source)
          : [{
              qLo: sourceQlo,
              labelPrefix: sourceShape === EVENT_SHAPE
                ? "EVENT"
                : sourceShape === SKILLBOX_SHAPE
                  ? "SKILLBOX"
                  : sourceShape === PANELNS_SHAPE
                    ? "PANELNS"
                    : sourceShape === CARD_NS_SHAPE
                      ? "CARD_NS"
                      : "SPANEL"
            }];
      for (const variant of controllerVariants) {
        for (const target of controllerTargetsByQlo.get(variant.qLo) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(244, 162, 97, 0.92)",
            dashed: [6, 3],
            label: `${variant.labelPrefix} -> cmd QLo ${variant.qLo}`
          });
        }
      }
    }

    for (const source of byShape.get(ALRMTRIG_SHAPE) ?? []) {
      const sourceMapByte = getMapByte(source);
      if (!Number.isInteger(sourceMapByte)) {
        continue;
      }
      for (const target of controllerTargetsByMapByte.get(sourceMapByte) ?? []) {
        if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(233, 196, 106, 0.84)",
          dashed: [2, 4],
          label: `ALRMTRIG lane ${sourceMapByte}`
        });
      }
    }

    return links;
  }

  function getArrowGraph() {
    if (!state.current) {
      return {
        teleportLinks: [],
        elevatorLinks: [],
        editorLinks: []
      };
    }

    const cacheKey = {
      current: state.current,
      dataRevision: state.current.dataRevision ?? 0,
      visibilityRevision: state.current.visibilityRevision ?? 0,
      includeEditor: includeEditorCheckbox.checked,
      includeRoofs: includeRoofsCheckbox.checked,
      includeOob: includeOobCheckbox.checked,
      showEditorLinkArrows: showEditorLinkArrowsCheckbox.checked
    };

    if (
      arrowGraphCache
      && arrowGraphCache.current === cacheKey.current
      && arrowGraphCache.dataRevision === cacheKey.dataRevision
      && arrowGraphCache.visibilityRevision === cacheKey.visibilityRevision
      && arrowGraphCache.includeEditor === cacheKey.includeEditor
      && arrowGraphCache.includeRoofs === cacheKey.includeRoofs
      && arrowGraphCache.includeOob === cacheKey.includeOob
      && arrowGraphCache.showEditorLinkArrows === cacheKey.showEditorLinkArrows
    ) {
      return arrowGraphCache;
    }

    const visibleItems = state.current.scene.items.filter((item) => isDrawableLinkItem(item));
    const byShape = new Map();
    for (const item of visibleItems) {
      const shape = getShapeNumber(item);
      if (!Number.isInteger(shape)) {
        continue;
      }
      const existing = byShape.get(shape) ?? [];
      existing.push(item);
      byShape.set(shape, existing);
    }

    arrowGraphCache = {
      ...cacheKey,
      teleportLinks: buildTeleportArrowLinks(visibleItems),
      elevatorLinks: buildElevatorArrowLinks(visibleItems),
      editorLinks: cacheKey.includeEditor && cacheKey.showEditorLinkArrows
        ? buildEditorHelperArrowLinks(visibleItems, byShape)
        : []
    };

    return arrowGraphCache;
  }

  function getFocusedMonsterSpawnerArrowLinks() {
    const focused = getFocusedItem();
    if (!focused || !isMonsterSpawnerItem(focused, getShapeDefinition(focused.shapeDefId)) || !isDrawableLinkItem(focused)) {
      return [];
    }

    const signalKey = getMonsterSpawnerSignalKey(focused);
    return getMonsterSpawnerPairCandidates(focused)
      .filter((target) => isDrawableLinkItem(target))
      .map((target) => ({
        source: focused,
        target,
        color: `rgba(${LIGHT_BLUE_ARROW_RGB}, 0.96)`,
        dashed: [7, 5],
        label: `Spawner QLo ${signalKey}`
      }));
  }

  function strokeArrow(targetContext, scale, offsetX, offsetY, sourcePoint, targetPoint, { color, dashed }) {
    const startX = sourcePoint.x * scale + offsetX;
    const startY = sourcePoint.y * scale + offsetY;
    const endX = targetPoint.x * scale + offsetX;
    const endY = targetPoint.y * scale + offsetY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 18) {
      return;
    }

    const unitX = deltaX / length;
    const unitY = deltaY / length;
    const inset = Math.min(18, length * 0.18);
    const lineStartX = startX + unitX * inset;
    const lineStartY = startY + unitY * inset;
    const lineEndX = endX - unitX * inset;
    const lineEndY = endY - unitY * inset;
    const headLength = 11;
    const headWidth = 5;

    targetContext.save();
    targetContext.strokeStyle = color;
    targetContext.fillStyle = color;
    targetContext.lineWidth = 2;
    targetContext.setLineDash(dashed);
    targetContext.beginPath();
    targetContext.moveTo(lineStartX, lineStartY);
    targetContext.lineTo(lineEndX, lineEndY);
    targetContext.stroke();
    targetContext.setLineDash([]);
    targetContext.beginPath();
    targetContext.moveTo(lineEndX, lineEndY);
    targetContext.lineTo(lineEndX - unitX * headLength - unitY * headWidth, lineEndY - unitY * headLength + unitX * headWidth);
    targetContext.lineTo(lineEndX - unitX * headLength + unitY * headWidth, lineEndY - unitY * headLength - unitX * headWidth);
    targetContext.closePath();
    targetContext.fill();
    targetContext.restore();
  }

  function drawLinkArrows(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    if (!state.current) {
      return;
    }

    const links = [];
    if (showLinkArrowsCheckbox.checked) {
      const arrowGraph = getArrowGraph();
      links.push(
        ...arrowGraph.teleportLinks,
        ...arrowGraph.elevatorLinks,
        ...getFocusedMonsterSpawnerArrowLinks()
      );
      if (showEditorLinkArrowsCheckbox.checked) {
        links.push(...arrowGraph.editorLinks);
      }
    } else if (showEditorLinkArrowsCheckbox.checked) {
      links.push(...getArrowGraph().editorLinks);
    }
    if (!links.length) {
      return;
    }

    targetContext.save();
    targetContext.globalAlpha = 1;
    for (const link of links) {
      const sourcePoint = getItemLinkPoint(link.source);
      const targetPoint = getItemLinkPoint(link.target);
      const minX = Math.min(sourcePoint.x, targetPoint.x) * scale + offsetX;
      const minY = Math.min(sourcePoint.y, targetPoint.y) * scale + offsetY;
      const maxX = Math.max(sourcePoint.x, targetPoint.x) * scale + offsetX;
      const maxY = Math.max(sourcePoint.y, targetPoint.y) * scale + offsetY;
      if (maxX < -24 || maxY < -24 || minX > canvasWidth + 24 || minY > canvasHeight + 24) {
        continue;
      }
      strokeArrow(targetContext, scale, offsetX, offsetY, sourcePoint, targetPoint, link);
    }
    targetContext.restore();
  }

  function projectBoundingBoxWireframe(item, definition) {
    const dimensions = definition?.dimensions;
    if (!dimensions || !state.current || !hasWorldPosition(item)) {
      return null;
    }

    const flipped = Boolean(item.flags.flipped);
    const xdim = (flipped ? dimensions.y : dimensions.x) * 32;
    const ydim = (flipped ? dimensions.x : dimensions.y) * 32;
    const zdim = dimensions.z * 8;
    const x = item.world.x;
    const y = item.world.y;
    const z = item.world.z;
    const xLeft = x - xdim;
    const yFar = y - ydim;
    const zTop = z + zdim;
    const minLeft = state.current.metadata.bounds.screenLeft;
    const minTop = state.current.metadata.bounds.screenTop;

    const sxLeft = Math.trunc(xLeft / 4 - y / 4) - minLeft;
    const sxRight = Math.trunc(x / 4 - yFar / 4) - minLeft;
    const sxTop = Math.trunc(xLeft / 4 - yFar / 4) - minLeft;
    const syTop = Math.trunc(xLeft / 8 + yFar / 8 - zTop) - minTop;
    const sxBot = Math.trunc(x / 4 - y / 4) - minLeft;
    const syBot = Math.trunc(x / 8 + y / 8 - z) - minTop;
    const syLeftTop = Math.trunc(xLeft / 8 + y / 8 - zTop) - minTop;
    const syRightTop = Math.trunc(x / 8 + yFar / 8 - zTop) - minTop;
    const syNearTop = Math.trunc(x / 8 + y / 8 - zTop) - minTop;
    const hitPolygon = [
      { x: sxTop, y: syTop },
      { x: sxLeft, y: syLeftTop }
    ];

    const segments = [
      [sxTop, syTop, sxLeft, syLeftTop],
      [sxTop, syTop, sxRight, syRightTop],
      [sxBot, syNearTop, sxLeft, syLeftTop],
      [sxBot, syNearTop, sxRight, syRightTop]
    ];

    if (z < zTop) {
      const syLeftBot = Math.trunc(xLeft / 8 + y / 8 - z) - minTop;
      const syRightBot = Math.trunc(x / 8 + yFar / 8 - z) - minTop;
      hitPolygon.push(
        { x: sxLeft, y: syLeftBot },
        { x: sxBot, y: syBot },
        { x: sxRight, y: syRightBot }
      );
      segments.push(
        [sxLeft, syLeftTop, sxLeft, syLeftBot],
        [sxRight, syRightTop, sxRight, syRightBot],
        [sxBot, syNearTop, sxBot, syBot],
        [sxLeft, syLeftBot, sxBot, syBot],
        [sxRight, syRightBot, sxBot, syBot]
      );
    } else {
      hitPolygon.push(
        { x: sxBot, y: syBot }
      );
    }

    hitPolygon.push({ x: sxRight, y: syRightTop });

    const xs = hitPolygon.map((point) => point.x);
    const ys = hitPolygon.map((point) => point.y);

    return {
      segments,
      hitPolygon,
      bounds: {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys)
      }
    };
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[prev];
      const intersects = ((current.y > point.y) !== (previous.y > point.y))
        && (point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 1e-9) + current.x);
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInScreenRect(point, item) {
    const screen = item?.screen;
    if (!screen) {
      return false;
    }
    return !(
      point.x < screen.left
      || point.x >= screen.right
      || point.y < screen.top
      || point.y >= screen.bottom
    );
  }

  function strokeSceneLine(targetContext, scale, offsetX, offsetY, x1, y1, x2, y2) {
    targetContext.moveTo(Math.round(x1 * scale + offsetX) + 0.5, Math.round(y1 * scale + offsetY) + 0.5);
    targetContext.lineTo(Math.round(x2 * scale + offsetX) + 0.5, Math.round(y2 * scale + offsetY) + 0.5);
  }

  function strokeFallbackBoundingRect(targetContext, scale, offsetX, offsetY, item) {
    const left = item.screen.left * scale + offsetX;
    const top = item.screen.top * scale + offsetY;
    const width = item.screen.width * scale;
    const height = item.screen.height * scale;
    const strokeLeft = Math.round(left) + 0.5;
    const strokeTop = Math.round(top) + 0.5;
    const strokeWidth = Math.max(1, Math.round(width) - 1);
    const strokeHeight = Math.max(1, Math.round(height) - 1);
    targetContext.strokeRect(strokeLeft, strokeTop, strokeWidth, strokeHeight);
  }

  function drawBoundingGeometry(targetContext, scale, offsetX, offsetY, geometry) {
    targetContext.beginPath();
    for (const [x1, y1, x2, y2] of geometry.segments) {
      strokeSceneLine(targetContext, scale, offsetX, offsetY, x1, y1, x2, y2);
    }
    targetContext.stroke();
  }

  function drawScenePolygon(targetContext, scale, offsetX, offsetY, polygon) {
    if (!polygon?.length) {
      return;
    }
    const [firstPoint, ...restPoints] = polygon;
    targetContext.beginPath();
    targetContext.moveTo(firstPoint.x * scale + offsetX, firstPoint.y * scale + offsetY);
    for (const point of restPoints) {
      targetContext.lineTo(point.x * scale + offsetX, point.y * scale + offsetY);
    }
    targetContext.closePath();
  }

  function getItemRangeLinkPoint(item) {
    if (!item?.screen) {
      return null;
    }
    return {
      x: item.screen.anchorX ?? Math.trunc((item.screen.left + item.screen.right) / 2),
      y: item.screen.anchorY ?? Math.trunc((item.screen.top + item.screen.bottom) / 2)
    };
  }

  function drawRangeConnector(targetContext, scale, offsetX, offsetY, geometry, item) {
    const itemPoint = getItemRangeLinkPoint(item);
    const rangePoint = geometry?.center;
    if (!itemPoint || !rangePoint) {
      return;
    }
    targetContext.beginPath();
    strokeSceneLine(targetContext, scale, offsetX, offsetY, itemPoint.x, itemPoint.y, rangePoint.x, rangePoint.y);
    targetContext.stroke();
  }

  function drawRangeOverlay(targetContext, scale, offsetX, offsetY, geometry, item, alpha = 1) {
    if (!geometry) {
      return;
    }

    targetContext.save();
    targetContext.fillStyle = `rgba(64, 156, 255, ${0.18 * alpha})`;
    targetContext.strokeStyle = `rgba(92, 181, 255, ${0.9 * alpha})`;
    targetContext.lineWidth = 1.5;
    targetContext.setLineDash([2, 6]);
    drawScenePolygon(targetContext, scale, offsetX, offsetY, geometry.hitPolygon);
    targetContext.fill();
    drawBoundingGeometry(targetContext, scale, offsetX, offsetY, geometry);
    targetContext.setLineDash([2, 10]);
    drawRangeConnector(targetContext, scale, offsetX, offsetY, geometry, item);
    targetContext.restore();
  }

  function getHighlightStrokeStyle(alpha) {
    if (showBoundingBoxesCheckbox.checked) {
      return `rgba(92, 181, 255, ${Math.max(0, Math.min(1, alpha))})`;
    }
    return `rgba(255, 255, 255, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function getHighlightShadowStyle(alpha) {
    if (showBoundingBoxesCheckbox.checked) {
      return `rgba(92, 181, 255, ${Math.max(0, Math.min(1, alpha * 0.55))})`;
    }
    return `rgba(255, 255, 255, ${Math.max(0, Math.min(1, alpha * 0.36))})`;
  }

  function advanceHighlightAnimation(timestamp) {
    const overlay = state.highlightOverlay;
    if (!overlay.geometry && !overlay.fallbackItem && overlay.alpha === 0 && overlay.targetAlpha === 0) {
      return false;
    }
    if (!overlay.lastTimestamp) {
      overlay.lastTimestamp = timestamp;
      return overlay.alpha !== overlay.targetAlpha;
    }

    const elapsed = Math.max(0, timestamp - overlay.lastTimestamp);
    overlay.lastTimestamp = timestamp;
    const duration = overlay.targetAlpha > overlay.alpha ? 85 : 320;
    const step = duration > 0 ? elapsed / duration : 1;
    if (overlay.targetAlpha > overlay.alpha) {
      overlay.alpha = Math.min(overlay.targetAlpha, overlay.alpha + step);
    } else if (overlay.targetAlpha < overlay.alpha) {
      overlay.alpha = Math.max(overlay.targetAlpha, overlay.alpha - step);
    }

    if (overlay.alpha === 0 && overlay.targetAlpha === 0 && !overlay.itemId) {
      overlay.geometry = null;
      overlay.fallbackItem = null;
    }
    return overlay.alpha !== overlay.targetAlpha;
  }

  function drawHighlightOverlay(targetContext, scale, offsetX, offsetY, timestamp) {
    const overlay = state.highlightOverlay;
    const animationActive = advanceHighlightAnimation(timestamp);
    if (overlay.alpha <= 0 || (!overlay.geometry && !overlay.fallbackItem)) {
      if (animationActive) {
        scheduleRender();
      }
      return;
    }

    targetContext.save();
    targetContext.strokeStyle = getHighlightStrokeStyle(overlay.alpha);
    targetContext.lineWidth = 1.5;
    targetContext.shadowBlur = showBoundingBoxesCheckbox.checked ? 12 : 8;
    targetContext.shadowColor = getHighlightShadowStyle(overlay.alpha);
    if (overlay.geometry) {
      drawBoundingGeometry(targetContext, scale, offsetX, offsetY, overlay.geometry);
    } else if (overlay.fallbackItem) {
      strokeFallbackBoundingRect(targetContext, scale, offsetX, offsetY, overlay.fallbackItem);
    }
    targetContext.restore();

    if (!alwaysShowRangesCheckbox.checked && overlay.itemId) {
      const item = getItemById(overlay.itemId);
      const rangeGeometry = getRangeGeometry(item);
      if (item && rangeGeometry) {
        drawRangeOverlay(targetContext, scale, offsetX, offsetY, rangeGeometry, item, overlay.alpha);
      }
    }

    if (animationActive) {
      scheduleRender();
    }
  }

  function drawBoundingBoxes(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, hiddenIds = new Set()) {
    if (!state.current || !showBoundingBoxesCheckbox.checked) {
      return;
    }

    targetContext.save();
    targetContext.strokeStyle = "rgba(255, 255, 255, 0.92)";
    targetContext.lineWidth = 1;
    targetContext.setLineDash([]);

    for (const item of state.current.scene.items) {
      if (hiddenIds.has(item.id) || !isItemVisible(item)) {
        continue;
      }

      const left = item.screen.left * scale + offsetX;
      const top = item.screen.top * scale + offsetY;
      const width = item.screen.width * scale;
      const height = item.screen.height * scale;

      if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
        continue;
      }

      const geometry = getBoundingGeometry(item);
      if (!geometry) {
        strokeFallbackBoundingRect(targetContext, scale, offsetX, offsetY, item);
        continue;
      }

      drawBoundingGeometry(targetContext, scale, offsetX, offsetY, geometry);
    }

    targetContext.restore();
  }

  function drawRangeOverlays(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, hiddenIds = new Set()) {
    if (!state.current || !alwaysShowRangesCheckbox.checked) {
      return;
    }

    for (const item of state.current.scene.items) {
      if (hiddenIds.has(item.id) || !isItemVisible(item)) {
        continue;
      }

      const geometry = getRangeGeometry(item);
      if (!geometry) {
        continue;
      }

      const left = geometry.bounds.left * scale + offsetX;
      const top = geometry.bounds.top * scale + offsetY;
      const width = (geometry.bounds.right - geometry.bounds.left) * scale;
      const height = (geometry.bounds.bottom - geometry.bounds.top) * scale;
      if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
        continue;
      }

      drawRangeOverlay(targetContext, scale, offsetX, offsetY, geometry, item);
    }
  }

  function drawEggLabels(targetContext, canvasWidth, canvasHeight) {
    if (!state.current || !showEggLabelsCheckbox.checked) {
      return;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const fontFamily = rootStyles.getPropertyValue("--font-ui").trim() || "sans-serif";

    targetContext.save();
    targetContext.font = `700 12px ${fontFamily}`;
    targetContext.textBaseline = "middle";
    targetContext.textAlign = "left";

    for (const item of getFilteredEggs()) {
      if (state.current.hiddenIds.has(item.id)) {
        continue;
      }

      const anchorX = item.screen.anchorX * state.zoom + state.offsetX;
      const anchorY = item.screen.anchorY * state.zoom + state.offsetY;
      if (anchorX < -24 || anchorY < -24 || anchorX > canvasWidth + 24 || anchorY > canvasHeight + 24) {
        continue;
      }

      const label = String(item.egg.labelId);
      const width = Math.ceil(targetContext.measureText(label).width) + 12;
      const height = 20;
      const left = Math.round(anchorX + 10);
      const top = Math.round(anchorY - height - 6);
      const selected = state.pinnedItemId === item.id;

      targetContext.strokeStyle = selected ? "rgba(255, 255, 255, 0.95)" : "rgba(17, 79, 89, 0.92)";
      targetContext.fillStyle = selected ? "rgba(17, 79, 89, 0.96)" : "rgba(12, 20, 31, 0.86)";
      targetContext.lineWidth = 1.25;
      targetContext.beginPath();
      targetContext.arc(Math.round(anchorX) + 0.5, Math.round(anchorY) + 0.5, selected ? 4 : 3, 0, Math.PI * 2);
      targetContext.fill();
      targetContext.fillRect(left, top, width, height);
      targetContext.strokeRect(left + 0.5, top + 0.5, width, height);
      targetContext.fillStyle = "#ffffff";
      targetContext.fillText(label, left + 6, top + height / 2 + 0.5);
    }

    targetContext.restore();
  }

  function renderScene(timestamp = performance.now()) {
    deps.resizeCanvas();
    context.clearRect(0, 0, viewport.clientWidth, viewport.clientHeight);
    drawSceneToContext(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
    if (state.eggPlacement?.previewItem) {
      drawSceneItemSprite(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.eggPlacement.previewItem, 0.78);
    }
    drawNpcPreviewOverlay(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
    drawItemPreviewOverlay(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
    drawRangeOverlays(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
    drawLinkArrows(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
    drawBoundingBoxes(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
    drawEggLabels(context, viewport.clientWidth, viewport.clientHeight);
    syncOverlayState();
    drawHighlightOverlay(context, state.zoom, state.offsetX, state.offsetY, timestamp);
  }

  function resetRenderCaches() {
    npcPreviewCanvasCache.clear();
    itemPreviewCanvasCache.clear();
    invalidateArrowGraphCache();
  }

  function pointHitsItem(point, item) {
    if (!isItemVisible(item)) {
      return false;
    }
    const geometry = getBoundingGeometry(item);
    const bounds = geometry?.bounds;
    if (bounds) {
      if (
        point.x < bounds.left
        || point.x >= bounds.right
        || point.y < bounds.top
        || point.y >= bounds.bottom
      ) {
        return false;
      }
      return pointInPolygon(point, geometry.hitPolygon);
    }
    return pointInScreenRect(point, item);
  }

  return {
    centerViewportOnItem,
    drawSceneToContext,
    drawTooltipPreview,
    getBoundingGeometry,
    getFilteredEggs,
    getItemDisplay,
    getRequestedPlacementTeleportId,
    hideInspectHighlight,
    hideOverlayTooltip,
    isEditorSelectableItem,
    isEggItem,
    isItemVisible,
    canPinItem,
    canKeepPinnedItemVisible,
    canKeepHoverItemVisible,
    pointHitsItem,
    renderEggList,
    renderMonsterSpawnerList,
    resetRenderCaches,
    scheduleRender,
    setEggPlacementWarning,
    syncOverlayState,
    updateEggListSelection,
    updateHiddenList,
    updateMonsterSpawnerListSelection
  };
}
