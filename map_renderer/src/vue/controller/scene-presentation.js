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
    showF7GridCheckbox,
    showAltF7SnapRangesCheckbox,
    showCtrlF7EggRangesCheckbox,
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
    getMonsterSpawnerLikelySpawnOwner,
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
  const MONITNS_SHAPE = 0x0102;
  const MONITEW_SHAPE = 0x0165;
  const FASTSKIL_SHAPE = 0x0120;
  const VALUEBOX_SHAPE = 0x0251;
  const PANELNS_SHAPE = 0x00a1;
  const PANELEW_SHAPE = 0x00a2;
  const CRUMORPH_SHAPE = 0x0318;
  const CARD_NS_SHAPE = 0x031d;
  const TELEPORTER_LIGHTS_SHAPE = 0x01db;
  const ELEVATOR_SHAPE = 0x021e;
  const REGRET_ELEVATOR_SHAPE = 0x0190;
  const EVENT_SHAPE = 0x0361;
  const NPC_ONLY_SHAPE = 0x0366;
  const SPANEL_SHAPE = 0x03aa;
  const GENERATR_SHAPE = 0x03c1;
  const FLAMEBOX_SHAPE = 0x0403;
  const CMD_LINK_SHAPE = 0x04b1;
  const SKILLBOX_SHAPE = 0x04e3;
  const BRO_BOOT_SHAPE = 0x04fe;
  const DOOR_DEATH_HELPER_SHAPE = 0x04f8;
  const STEAMBOX_SHAPE = 0x0500;
  const WATCHNS_SHAPE = 0x04c6;
  const WATCHEW_SHAPE = 0x04de;
  const SECRET_DOOR_POST_SHAPE = 0x0510;
  const ALARMHAT_SHAPE = 0x0561;
  const ALRMTRIG_SHAPE = 0x0581;
  const MONSTER_SPAWNER_SHAPE = 0x04d0;
  const PRESSURE_BARRIER_V_SHAPE = 0x05df;
  const PRESSURE_BARRIER_H_SHAPE = 0x05e0;
  const MOVABLE_WALL_TARGET_SHAPES = new Set([0x01ab, 0x0393, 0x03e8]);
  const MOVABLE_WALL_TRIGGER_CLASSES = new Set(["TRIGEGG", "ONCEEGG"]);
  const CRYOBOX_SHAPE = 0x05e1;
  const FLAME_HELPER_SHAPES = new Set([0x0438, 0x0439, 0x043a, 0x043b, 0x050a, 0x0518]);
  const STEAM_TARGET_SHAPES = new Set([0x03a9, 0x04f9, 0x04fa, 0x04fd, 0x0511]);
  const DOOR_TARGET_SHAPES = new Set([0x0005, 0x0046, 0x007b, 0x0095, 0x0099, 0x00a9, 0x030a, 0x030b, 0x03f8, 0x03ff]);
  const CHANGER_REMORSE_ROOF_TARGET_SHAPES = new Set([0x03a7, 0x03a8, 0x021a, 0x012e, 0x051c, 0x051b]);
  const CHANGER_REGRET_ROOF_TARGET_SHAPES = new Set([0x03a7, 0x03a8, 0x021a, 0x012e, 0x04df, 0x051c, 0x051b, 0x0639, 0x063a, 0x063b, 0x063c, 0x063d]);
  const LIGHT_BLUE_ARROW_RGB = "148, 220, 255";
  const LOCAL_EDITOR_LINK_DISTANCE = 768;
  const LOCAL_ALARM_LINK_DISTANCE = 512;
  const LOCAL_DOOR_LINK_DISTANCE = 640;
  const LOCAL_MOVABLE_WALL_LINK_DISTANCE = 1152;
  const MOVABLE_WALL_Z_TOLERANCE = 16;
  const CRYOBOX_LINK_DISTANCE = 1024;
  const CHANGER_REMORSE_SCAN_DISTANCE = 100 * 32;
  const CRUSADER_EGG_RANGE_WORLD_UNITS = 64;
  const SNAP_EGG_SHAPE = 0x04fe;
  const F7_GRID_WORLD_UNITS = 0x200;
  const VGA_PALETTE_CHANNEL_MAX = 0x3f;
  const VGA_PALETTE_TICK_MS = 180;
  const OVERLAY_PALETTE_INDEX = Object.freeze({
    f7: 0x0e,
    altF7: 0x09,
    ctrlF7: 0x0d
  });
    function shouldUseAuthoredScreenRect(item) {
      const currentGame = state.current?.metadata?.game ?? state.current?.selected?.game;
      return currentGame === "psx-remorse" && Boolean(item?.screen);
    }
  const CYCLE_COLOR_NUMBERS = Object.freeze([8, 9, 10, 11, 12, 13, 14]);
  const CYCLE_COLOR_WORD_FLAGS = Object.freeze([0, 0, 0, 0, 0, 0, 1]);
  const CYCLE_COLOR_FLAGS = Object.freeze([
    [1, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 1, 1],
    [0, 1, 0]
  ]);
  const CYCLE_COLOR_VALUES = Object.freeze([
    [0, 0, 0],
    [0, 0, 0],
    [0x1f, 0, 0],
    [0, 0, 0x1f],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]);
  const OVERLAY_CYCLE_RANDOM_SEED = 0x1438;
  const overlayPaletteCycleState = createOverlayPaletteCycleState();
  const USECODE_TRIGGER_EGG_SUBTYPE_CLASSES = {
    remorse: {
      0: { className: "TRIGEGG", arrowMode: "trigger-qlo" },
      1: { className: "ONCEEGG", arrowMode: "trigger-qlo" },
      2: { className: "FLOOR1", arrowMode: null },
      4: { className: "CHANGER", arrowMode: "remorse-changer-roof-by-egg-id" },
      13: { className: "MISS1EGG", arrowMode: null }
    },
    regret: {
      0: { className: "TRIGEGG", arrowMode: "trigger-qlo" },
      1: { className: "ONCEEGG", arrowMode: "trigger-qlo" },
      2: { className: "FLOOR1", arrowMode: null },
      5: { className: "MHATCHER", arrowMode: "monster-by-egg-id" },
      8: { className: "CHANGER", arrowMode: "regret-changer-roof-by-egg-id" },
      10: { className: "DOOREGG", arrowMode: "door-by-egg-id" },
      13: { className: "MISS1", arrowMode: null },
      24: { className: "VIDEOEGG", arrowMode: null }
    }
  };

  function hasWorldPosition(item) {
    return Boolean(
      item?.world
      && Number.isFinite(item.world.x)
      && Number.isFinite(item.world.y)
      && Number.isFinite(item.world.z)
    );
  }

  function createOverlayPaletteCycleState() {
    return {
      tick: 0,
      rng: OVERLAY_CYCLE_RANDOM_SEED,
      rows: CYCLE_COLOR_VALUES.map((row) => [...row])
    };
  }

  function resetOverlayPaletteCycleState() {
    overlayPaletteCycleState.tick = 0;
    overlayPaletteCycleState.rng = OVERLAY_CYCLE_RANDOM_SEED;
    overlayPaletteCycleState.rows = CYCLE_COLOR_VALUES.map((row) => [...row]);
  }

  function nextOverlayPaletteRandom(maxExclusive) {
    overlayPaletteCycleState.rng = (overlayPaletteCycleState.rng * 1103515245 + 12345) & 0x7fffffff;
    return maxExclusive > 0 ? ((overlayPaletteCycleState.rng >>> 16) % maxExclusive) : 0;
  }

  function advanceOverlayPaletteCycleRow(row, flags) {
    let wrapped = false;
    for (let index = 0; index < row.length; index += 1) {
      if (!flags[index]) {
        continue;
      }
      row[index] += 2;
      if (row[index] > VGA_PALETTE_CHANNEL_MAX) {
        row[index] = 0;
        wrapped = true;
      }
    }
    return wrapped;
  }

  function advanceOverlayPaletteCycleState() {
    for (let index = 0; index < overlayPaletteCycleState.rows.length; index += 1) {
      const row = overlayPaletteCycleState.rows[index];
      const wrapped = advanceOverlayPaletteCycleRow(row, CYCLE_COLOR_FLAGS[index]);
      if (CYCLE_COLOR_WORD_FLAGS[index] === 1 && wrapped) {
        for (let channelIndex = 0; channelIndex < row.length; channelIndex += 1) {
          row[channelIndex] = (row[channelIndex] + nextOverlayPaletteRandom(10)) & VGA_PALETTE_CHANNEL_MAX;
        }
      }
    }
  }

  function getOverlayPaletteRows(timestamp) {
    const targetTick = Math.max(0, Math.floor(timestamp / VGA_PALETTE_TICK_MS));
    if (targetTick < overlayPaletteCycleState.tick) {
      resetOverlayPaletteCycleState();
    }
    while (overlayPaletteCycleState.tick < targetTick) {
      advanceOverlayPaletteCycleState();
      overlayPaletteCycleState.tick += 1;
    }
    return overlayPaletteCycleState.rows;
  }

  function scaleVgaPaletteChannel(value) {
    return Math.round((Math.max(0, Math.min(VGA_PALETTE_CHANNEL_MAX, value)) * 255) / VGA_PALETTE_CHANNEL_MAX);
  }

  function getOverlayPaletteRgb(paletteIndex, timestamp) {
    const rowIndex = CYCLE_COLOR_NUMBERS.indexOf(paletteIndex);
    if (rowIndex === -1) {
      return "255, 255, 255";
    }
    const row = getOverlayPaletteRows(timestamp)[rowIndex];
    return row.map((channel) => scaleVgaPaletteChannel(channel)).join(", ");
  }

  function buildOverlayPaletteStyles(paletteIndex, timestamp, overrides = {}) {
    const rgb = getOverlayPaletteRgb(paletteIndex, timestamp);
    return {
      fillRgb: rgb,
      strokeRgb: rgb,
      connectorRgb: rgb,
      ...overrides
    };
  }

  function hasAnimatedPaletteCycleOverlay() {
    return Boolean(
      state.current
      && (showF7GridCheckbox.checked || showAltF7SnapRangesCheckbox.checked || showCtrlF7EggRangesCheckbox.checked)
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

  function projectWorldDiamondBounds(centerX, centerY, worldZ, halfX, halfY) {
    if (!state.current) {
      return null;
    }

    const minLeft = state.current.metadata.bounds.screenLeft;
    const minTop = state.current.metadata.bounds.screenTop;
    const projectPoint = (worldX, worldY, z = worldZ) => ({
      x: Math.trunc(worldX / 4 - worldY / 4) - minLeft,
      y: Math.trunc(worldX / 8 + worldY / 8 - z) - minTop
    });

    const topPoint = projectPoint(centerX - halfX, centerY - halfY);
    const leftPoint = projectPoint(centerX - halfX, centerY + halfY);
    const bottomPoint = projectPoint(centerX + halfX, centerY + halfY);
    const rightPoint = projectPoint(centerX + halfX, centerY - halfY);
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

  function projectCycleHelperPolygon(centerX, centerY, worldZ, xRangeSteps, yRangeSteps) {
    if (!state.current) {
      return null;
    }

    const minLeft = state.current.metadata.bounds.screenLeft;
    const minTop = state.current.metadata.bounds.screenTop;
    const projectPoint = (worldX, worldY, z = worldZ) => ({
      x: Math.trunc(worldX / 4 - worldY / 4) - minLeft,
      y: Math.trunc(worldX / 8 + worldY / 8 - z) - minTop
    });

    const centerPoint = projectPoint(centerX, centerY);
    const pointA = {
      x: centerPoint.x + yRangeSteps * 0x10,
      y: centerPoint.y - yRangeSteps * 0x08
    };
    const pointB = {
      x: pointA.x - xRangeSteps * 0x10,
      y: pointA.y - xRangeSteps * 0x08
    };
    const pointC = {
      x: pointB.x - yRangeSteps * 0x10,
      y: pointB.y + yRangeSteps * 0x08
    };
    const hitPolygon = [centerPoint, pointA, pointB, pointC];
    const xs = hitPolygon.map((point) => point.x);
    const ys = hitPolygon.map((point) => point.y);

    return {
      center: centerPoint,
      segments: [
        [centerPoint.x, centerPoint.y, pointA.x, pointA.y],
        [pointA.x, pointA.y, pointB.x, pointB.y],
        [pointB.x, pointB.y, pointC.x, pointC.y],
        [pointC.x, pointC.y, centerPoint.x, centerPoint.y]
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

  function getUsecodeTriggerEggSubtypeInfo(item) {
    if (getShapeNumber(item) !== USECODE_TRIGGER_EGG_SHAPE || item?.egg?.type !== "usecode-trigger") {
      return null;
    }

    const gameId = state.current?.selected?.game ?? null;
    const qLo = getQualityLowByte(item);
    if (!Number.isInteger(qLo)) {
      return null;
    }

    const subtypeCatalog = USECODE_TRIGGER_EGG_SUBTYPE_CLASSES[gameId] ?? null;
    const subtype = subtypeCatalog ? subtypeCatalog[qLo] ?? null : null;

    return {
      qLo,
      eggId: Number.isInteger(item?.mapNum) ? (item.mapNum & 0xff) : null,
      ...(subtype ?? { className: null, arrowMode: null })
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

    return projectWorldDiamondBounds(
      item.world.x,
      item.world.y,
      item.world.z,
      range.worldXRange,
      range.worldYRange
    );
  }

  function projectSnapMarkerRange(item) {
    if (!hasWorldPosition(item) || getShapeNumber(item) !== SNAP_EGG_SHAPE) {
      return null;
    }

    const rawQuality = Number.isInteger(item.quality) ? (item.quality & 0xffff) : null;
    const rawMapNum = Number.isInteger(item.mapNum) ? (item.mapNum & 0xff) : null;
    const rawNpcNum = Number.isInteger(item.npcNum) ? (item.npcNum & 0xff) : null;
    if (rawQuality === null || rawMapNum === null || rawNpcNum === null) {
      return null;
    }

    const signedByte = (value) => (value & 0x80) ? value - 0x100 : value;
    const qHi = (rawQuality >> 8) & 0xff;
    const xRangeNibble = (qHi >> 4) & 0x0f;
    const yRangeNibble = qHi & 0x0f;
    const xRangeSteps = xRangeNibble * 2;
    const yRangeSteps = yRangeNibble * 2;
    const centerX = item.world.x + xRangeNibble * 0x20 + signedByte(rawMapNum) * 0x20;
    const centerY = item.world.y + yRangeNibble * 0x20 + signedByte(rawNpcNum) * 0x20;

    return projectCycleHelperPolygon(
      centerX,
      centerY,
      item.world.z,
      xRangeSteps,
      yRangeSteps
    );
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

  function isEggHatcherRangeItem(item) {
    return item?.egg?.type === "usecode-trigger" && hasWorldPosition(item);
  }

  function isSnapCoverageItem(item) {
    return getShapeNumber(item) === SNAP_EGG_SHAPE && hasWorldPosition(item);
  }

  function getEggHatcherRangeGeometry(item) {
    return isEggHatcherRangeItem(item) ? projectUsecodeTriggerEggRange(item) : null;
  }

  function getSnapCoverageGeometry(item) {
    if (!isSnapCoverageItem(item)) {
      return null;
    }
    return projectSnapMarkerRange(item);
  }

  function scenePointToWorldPoint(sceneX, sceneY, worldZ = 0) {
    if (!state.current) {
      return null;
    }

    const sx = sceneX + state.current.metadata.bounds.screenLeft;
    const sy = sceneY + state.current.metadata.bounds.screenTop + worldZ;
    return {
      x: Math.round(2 * sx + 4 * sy),
      y: Math.round(4 * sy - 2 * sx)
    };
  }

  function getWorldGridGeometries(canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    if (!state.current) {
      return [];
    }

    const sceneCorners = [
      scenePointToWorldPoint((-offsetX) / scale, (-offsetY) / scale, 0),
      scenePointToWorldPoint((canvasWidth - offsetX) / scale, (-offsetY) / scale, 0),
      scenePointToWorldPoint((-offsetX) / scale, (canvasHeight - offsetY) / scale, 0),
      scenePointToWorldPoint((canvasWidth - offsetX) / scale, (canvasHeight - offsetY) / scale, 0)
    ].filter(Boolean);
    if (!sceneCorners.length) {
      return [];
    }

    const worldXs = sceneCorners.map((point) => point.x);
    const worldYs = sceneCorners.map((point) => point.y);
    const minWorldX = Math.min(...worldXs) - F7_GRID_WORLD_UNITS;
    const maxWorldX = Math.max(...worldXs) + F7_GRID_WORLD_UNITS;
    const minWorldY = Math.min(...worldYs) - F7_GRID_WORLD_UNITS;
    const maxWorldY = Math.max(...worldYs) + F7_GRID_WORLD_UNITS;
    const startCellX = Math.floor(minWorldX / F7_GRID_WORLD_UNITS);
    const endCellX = Math.floor(maxWorldX / F7_GRID_WORLD_UNITS);
    const startCellY = Math.floor(minWorldY / F7_GRID_WORLD_UNITS);
    const endCellY = Math.floor(maxWorldY / F7_GRID_WORLD_UNITS);
    const geometries = [];

    for (let cellY = startCellY; cellY <= endCellY; cellY += 1) {
      for (let cellX = startCellX; cellX <= endCellX; cellX += 1) {
        const x0 = cellX * F7_GRID_WORLD_UNITS;
        const y0 = cellY * F7_GRID_WORLD_UNITS;
        const geometry = projectWorldDiamondBounds(
          x0 + F7_GRID_WORLD_UNITS / 2,
          y0 + F7_GRID_WORLD_UNITS / 2,
          0,
          F7_GRID_WORLD_UNITS / 2,
          F7_GRID_WORLD_UNITS / 2
        );
        if (geometry) {
          geometries.push(geometry);
        }
      }
    }

    return geometries;
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

  function isWithinAxisAlignedLinkDistance(left, right, maxDistance) {
    if (!left || !right || !hasWorldPosition(left) || !hasWorldPosition(right)) {
      return false;
    }
    return Math.abs(left.world.x - right.world.x) <= maxDistance
      && Math.abs(left.world.y - right.world.y) <= maxDistance;
  }

  function hasLinkZTolerance(left, right, maxDelta) {
    if (!left || !right || !hasWorldPosition(left) || !hasWorldPosition(right)) {
      return false;
    }
    return Math.abs(left.world.z - right.world.z) <= maxDelta;
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

    const gameId = state.current?.selected?.game ?? null;
    const definition = getShapeDefinition(item.shapeDefId);
    if (item.frame !== 0 || !Number.isInteger(item.quality)) {
      return null;
    }

    const qlo = item.quality & 0xff;
    if (definition?.shape === REGRET_ELEVATOR_SHAPE && String(gameId).startsWith("regret")) {
      if (qlo >= 100 && qlo < 0xc8) {
        return {
          labelId: qlo,
          evidence: "regret-elevator-qlo"
        };
      }
      return null;
    }

    if (definition?.shape !== ELEVATOR_SHAPE) {
      return null;
    }

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

  function getFixedSceneItemId(item) {
    if (item?.source === "fixed" && Number.isInteger(item?.mapSourceIndex)) {
      return `fixed:${item.mapSourceIndex}`;
    }
    return null;
  }

  function getStableSceneItemId(item) {
    return getFixedSceneItemId(item) ?? item?.stableId ?? item?.id ?? "-";
  }

  function getMonsterSpawnerStateDisplay(item) {
    if (item?.frame === 0) {
      return isMonsterSpawnerAutoEnterEnabled(item)
        ? {
            shortLabel: "☑ Auto",
            tooltipLabel: "☑ Auto-enabled enter-area spawn",
            badgeClass: "egg-item-badge is-spawn-auto",
            color: "rgba(79, 205, 126, 0.96)",
            stroke: "rgba(14, 30, 18, 0.9)",
            kind: "auto"
          }
        : {
            shortLabel: "☒ Dormant",
            tooltipLabel: "☒ Dormant until signaled",
            badgeClass: "egg-item-badge is-spawn-blocked",
            color: "rgba(218, 75, 36, 0.98)",
            stroke: "rgba(44, 10, 6, 0.92)",
            kind: "blocked"
          };
    }

    return {
      shortLabel: `◌ F${formatNumericField(item?.frame)}`,
      tooltipLabel: `◌ Frame ${formatNumericField(item?.frame)} pair state`,
      badgeClass: "egg-item-badge is-spawn-pair",
      color: "rgba(124, 168, 221, 0.96)",
      stroke: "rgba(10, 16, 28, 0.92)",
      kind: "pair"
    };
  }

  async function copyTextToClipboard(text, successMessage, failureMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
      setStatus(`${successMessage} copied to clipboard.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : failureMessage);
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
      const definition = getShapeDefinition(item.shapeDefId);
      const npcInfo = getNpcSpawnerInfoForItem(item, definition);
      const spawnOwner = getMonsterSpawnerLikelySpawnOwner(item);
      const spawnNpcInfo = spawnOwner.item ? getNpcSpawnerInfoForItem(spawnOwner.item, definition) : null;
      const signalKey = getMonsterSpawnerSignalKey(item);
      const stateDisplay = getMonsterSpawnerStateDisplay(item);
      const fixedId = getFixedSceneItemId(item);
      const stableId = getStableSceneItemId(item);
      const npcLabel = npcInfo
        ? `${item.npcNum} (${npcInfo.name})`
        : `NPC ${formatNumericField(item.npcNum)}`;
      const spawnLabel = spawnNpcInfo
        ? `${spawnOwner.item.npcNum} (${spawnNpcInfo.name})`
        : (spawnOwner.item ? `NPC ${formatNumericField(spawnOwner.item.npcNum)}` : "spawn unresolved");
      const rowSummary = item.frame === 0
        ? `practical preview ${spawnLabel}${spawnOwner.basis ? ` (${spawnOwner.basis})` : ""}`
        : `${npcLabel} partner -> ${spawnLabel}${spawnOwner.ambiguous ? ` (nearest of ${spawnOwner.pairCount})` : ""}`;

      const row = document.createElement("div");
      row.className = "monster-spawner-item-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "egg-item-button monster-spawner-item-button";
      button.setAttribute("data-monster-spawner-item-id", item.id);
      button.innerHTML = `
        <div class="egg-item-title-row">
          <span class="egg-item-id">${escapeHtml(stableId)}</span>
          <span class="${escapeHtml(stateDisplay.badgeClass)}">${escapeHtml(stateDisplay.shortLabel)}</span>
        </div>
        <div class="egg-item-meta">${escapeHtml(`${rowSummary} · QLo ${formatNumericField(signalKey)} · world ${formatWorldCoords(item)}`)}</div>
        ${fixedId && fixedId !== item.id ? `<div class="egg-item-meta">${escapeHtml(item.id)}</div>` : ""}
      `;
      button.addEventListener("click", () => {
        centerViewportOnItem(item);
        state.pinnedItemId = item.id;
        state.hoverItemId = null;
        syncOverlayState();
        updateMonsterSpawnerListSelection();
        scheduleRender();
      });
      row.append(button);
      if (fixedId) {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "monster-spawner-copy-button";
        copyButton.textContent = "Copy ID";
        copyButton.title = `Copy ${fixedId}`;
        copyButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await copyTextToClipboard(fixedId, "Fixed ID", "Failed to copy fixed ID.");
        });
        row.append(copyButton);
      }
      monsterSpawnerList.append(row);
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
      const subtype = getUsecodeTriggerEggSubtypeInfo(item);
      const triggerSuffix = item.egg?.type === "usecode-trigger" && subtype?.className
        ? ` · ${subtype.className} · QLo ${subtype.qLo}`
        : "";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "egg-item-button";
      button.setAttribute("data-egg-item-id", item.id);
      button.innerHTML = `
        <div class="egg-item-title-row">
          <span class="egg-item-id">${escapeHtml(formatEggId(item.egg.labelId))}</span>
          <span class="egg-item-badge">${escapeHtml(describeEggType(item.egg))}</span>
        </div>
        <div class="egg-item-meta">world ${escapeHtml(formatWorldCoords(item))} · shape ${escapeHtml(display.shapeHex)}${escapeHtml(triggerSuffix)}</div>
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
    const fixedId = getFixedSceneItemId(item);
    const stableId = getStableSceneItemId(item);
    const stateDisplay = isMonsterSpawnerItem(item, display.definition) ? getMonsterSpawnerStateDisplay(item) : null;
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
      ${fixedId ? `<dt>Fixed ID</dt><dd>${escapeHtml(fixedId)}</dd>` : `<dt>Stable ID</dt><dd>${escapeHtml(stableId)}</dd>`}
      <dt>Kind</dt><dd>${escapeHtml(display.kind)}</dd>
      <dt>Family</dt><dd>${escapeHtml(display.family)}</dd>
      <dt>World</dt><dd>${escapeHtml(formatWorldCoords(item))}</dd>
      <dt>Disk</dt><dd>${escapeHtml(formatDiskCoords(item))}</dd>
      ${stateDisplay ? `<dt>Spawn state</dt><dd>${escapeHtml(stateDisplay.tooltipLabel)}</dd>` : ""}
      <dt>Source</dt><dd>${escapeHtml(item.source)}</dd>
      ${fixedId && item.id !== fixedId ? `<dt>Runtime ID</dt><dd>${escapeHtml(item.id)}</dd>` : ""}
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
      onCopyStableId: fixedId || stableId
        ? async () => {
            await copyTextToClipboard(fixedId || stableId, fixedId ? "Fixed ID" : "Stable ID", fixedId ? "Failed to copy fixed ID." : "Failed to copy stable ID.");
          }
        : null,
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
      meta.textContent = `${display.shapeHex} · ${item.stableId || item.id}`;
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

    const dormant = isDormantMonsterSpawner(item);
    const baseOpacity = dormant
      ? Math.min(opacityOverride ?? item.presentation.opacity ?? 1, 0.66)
      : (opacityOverride ?? item.presentation.opacity ?? 1);
    targetContext.globalAlpha = baseOpacity;
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
      && shouldRenderNpcPreviewForItem(item)
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

  function isDormantMonsterSpawner(item) {
    return isMonsterSpawnerItem(item, getShapeDefinition(item?.shapeDefId))
      && item?.frame === 0
      && !isMonsterSpawnerAutoEnterEnabled(item);
  }

  function getMonsterSpawnerPreviewRenderState(item) {
    if (!isMonsterSpawnerItem(item, getShapeDefinition(item?.shapeDefId))) {
      return { visible: true, tint: "rgba(92, 181, 255, 1)", basis: "default" };
    }

    const practicalPreview = getMonsterSpawnerLikelySpawnOwner(item);
    if (practicalPreview.item?.id !== item.id) {
      return { visible: false, tint: null, basis: practicalPreview.basis };
    }

    if (item.frame === 0) {
      return isMonsterSpawnerAutoEnterEnabled(item)
        ? { visible: true, tint: "rgba(92, 181, 255, 1)", basis: practicalPreview.basis }
        : { visible: true, tint: "rgba(234, 96, 74, 1)", basis: practicalPreview.basis };
    }
    return {
      visible: true,
      tint: "rgba(92, 181, 255, 1)",
      basis: practicalPreview.basis
    };
  }

  function shouldRenderNpcPreviewForItem(item) {
    return getMonsterSpawnerPreviewRenderState(item).visible;
  }

  function getNpcPreviewGhost(item, sprite, atlas) {
    const previewState = getMonsterSpawnerPreviewRenderState(item);
    return getTintedPreviewGhost(npcPreviewCanvasCache, sprite, atlas, previewState.tint ?? "rgba(92, 181, 255, 1)");
  }

  function getItemPreviewGhost(item, sprite, atlas) {
    return getTintedPreviewGhost(itemPreviewCanvasCache, sprite, atlas, "rgba(244, 197, 84, 1)");
  }

  function projectPreviewSpriteRect(item, sprite) {
    if (!state.current || !hasWorldPosition(item)) {
      return null;
    }

    const bounds = state.current.metadata?.bounds;
    const sxBot = Math.trunc(item.world.x / 4 - item.world.y / 4) - (bounds?.screenLeft ?? 0);
    const syBot = Math.trunc(item.world.x / 8 + item.world.y / 8 - item.world.z) - (bounds?.screenTop ?? 0);
    const flipped = Boolean(item.flags?.flipped);
    const left = flipped ? sxBot + sprite.xoff - sprite.width : sxBot - sprite.xoff;
    const top = syBot - sprite.yoff;
    return {
      left,
      top,
      width: sprite.width,
      height: sprite.height,
      flipped
    };
  }

  function drawPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, items, getPreviewGhost, previewKey) {
    if (!items.length) {
      return;
    }

    targetContext.save();
    targetContext.imageSmoothingEnabled = false;

    for (const item of items) {
      const preview = item?.[previewKey];
      const sprite = state.current.spriteIndex.get(preview.spriteId) ?? null;
      const atlas = sprite ? state.current.atlasImages.get(sprite.atlasId) : null;
      if (!sprite || !atlas) {
        continue;
      }

      const screenRect = projectPreviewSpriteRect(item, sprite);
      if (!screenRect) {
        continue;
      }

      const ghost = getPreviewGhost(item, sprite, atlas);
      const width = screenRect.width * scale;
      const height = screenRect.height * scale;
      const left = screenRect.left * scale + offsetX;
      const top = screenRect.top * scale + offsetY;
      if (left + width < 0 || top + height < 0 || left > canvasWidth || top > canvasHeight) {
        continue;
      }

      const selected = item.id === state.pinnedItemId;
      const hovered = item.id === state.hoverItemId;
      const outlinePad = ghost.outlinePadding * scale;
      const outlineWidth = (sprite.width + ghost.outlinePadding * 2) * scale;
      const outlineHeight = (sprite.height + ghost.outlinePadding * 2) * scale;
      targetContext.globalAlpha = selected ? 0.88 : hovered ? 0.8 : 0.72;
      if (screenRect.flipped) {
        targetContext.save();
        targetContext.translate(left + width + outlinePad, top - outlinePad);
        targetContext.scale(-1, 1);
        targetContext.drawImage(ghost.outline, 0, 0, outlineWidth, outlineHeight);
        targetContext.restore();
      } else {
        targetContext.drawImage(ghost.outline, left - outlinePad, top - outlinePad, outlineWidth, outlineHeight);
      }

      targetContext.globalAlpha = selected ? 0.42 : hovered ? 0.38 : 0.34;
      if (screenRect.flipped) {
        targetContext.save();
        targetContext.translate(left + width, top);
        targetContext.scale(-1, 1);
        targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, width, height);
        targetContext.restore();
      } else {
        targetContext.drawImage(atlas, sprite.x, sprite.y, sprite.width, sprite.height, left, top, width, height);
      }
    }

    targetContext.restore();
  }

  function drawNpcPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    const items = getVisibleNpcPreviewItems();
    drawPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, items, getNpcPreviewGhost, "npcPreview");
  }

  function drawItemPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY) {
    const items = getVisibleItemPreviewItems();
    drawPreviewOverlay(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, items, getItemPreviewGhost, "itemPreview");
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
    const movableWallTargets = [];
    const controllerTargetsByQlo = new Map();
    const controllerTargetsByMapByte = new Map();
    const monsterSpawnerTargetsByQlo = new Map();
    const changerRemorseRoofTargetsByQlo = new Map();
    const changerRegretRoofTargetsByQlo = new Map();

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
    for (const target of monsterSpawnerTargets) {
      addItemToBucket(monsterSpawnerTargetsByQlo, getQualityLowByte(target), target);
    }
    for (const shape of MOVABLE_WALL_TARGET_SHAPES) {
      for (const target of byShape.get(shape) ?? []) {
        movableWallTargets.push(target);
      }
    }
    for (const shape of CHANGER_REMORSE_ROOF_TARGET_SHAPES) {
      for (const target of byShape.get(shape) ?? []) {
        if (target?.kind !== "roof") {
          continue;
        }
        addItemToBucket(changerRemorseRoofTargetsByQlo, getQualityLowByte(target), target);
      }
    }
    for (const shape of CHANGER_REGRET_ROOF_TARGET_SHAPES) {
      for (const target of byShape.get(shape) ?? []) {
        if (target?.kind !== "roof") {
          continue;
        }
        addItemToBucket(changerRegretRoofTargetsByQlo, getQualityLowByte(target), target);
      }
    }

    const doorTargetsByQlo = buildQloIndexForShapes(DOOR_TARGET_SHAPES);
    const spanelTargetsByQlo = buildQloIndexForShapes(new Set([SPANEL_SHAPE]));
    const steamTargetsByQlo = buildQloIndexForShapes(STEAM_TARGET_SHAPES);
    const flameTargetsByQlo = buildQloIndexForShapes(FLAME_HELPER_SHAPES);
    const valueBoxTargetsByQlo = buildQloIndexForShapes(new Set([VALUEBOX_SHAPE]));

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

    for (const source of byShape.get(USECODE_TRIGGER_EGG_SHAPE) ?? []) {
      const subtype = getUsecodeTriggerEggSubtypeInfo(source);
      if (!subtype?.className) {
        continue;
      }

      if (MOVABLE_WALL_TRIGGER_CLASSES.has(subtype.className) && Number.isInteger(subtype.eggId)) {
        for (const cmdTarget of controllerTargetsByQlo.get(subtype.eggId) ?? []) {
          const cmdMetadata = getCmdLinkMetadata(cmdTarget);
          if (!cmdMetadata?.itemMode || cmdMetadata.targetKind !== "exact-shape") {
            continue;
          }
          if (!isWithinLinkDistance(source, cmdTarget, LOCAL_MOVABLE_WALL_LINK_DISTANCE)) {
            continue;
          }
          if (!hasLinkZTolerance(source, cmdTarget, MOVABLE_WALL_Z_TOLERANCE)) {
            continue;
          }

          const matchingWalls = movableWallTargets.filter((target) => (
            isWithinLinkDistance(cmdTarget, target, LOCAL_MOVABLE_WALL_LINK_DISTANCE)
            && hasLinkZTolerance(cmdTarget, target, MOVABLE_WALL_Z_TOLERANCE)
          ));
          if (!matchingWalls.length) {
            continue;
          }

          pushUniqueLink(links, seenKeys, source, cmdTarget, {
            color: "rgba(233, 196, 106, 0.94)",
            dashed: [2, 4],
            label: `${subtype.className} egg ${subtype.eggId} -> cmd QLo ${subtype.eggId}`
          });

          for (const target of matchingWalls) {
            pushUniqueLink(links, seenKeys, cmdTarget, target, {
              color: "rgba(214, 40, 40, 0.9)",
              dashed: [6, 2],
              label: `cmd QLo ${subtype.eggId} -> movable wall`
            });
          }
        }
      }

      if (subtype.arrowMode === "trigger-qlo") {
        for (const target of controllerTargetsByQlo.get(subtype.qLo) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(233, 196, 106, 0.9)",
            dashed: [4, 4],
            label: `${subtype.className} -> cmd QLo ${subtype.qLo}`
          });
        }
        continue;
      }

      if (subtype.arrowMode === "monster-by-egg-id" && Number.isInteger(subtype.eggId)) {
        for (const target of monsterSpawnerTargetsByQlo.get(subtype.eggId) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_ALARM_LINK_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(105, 168, 236, 0.9)",
            dashed: [5, 4],
            label: `${subtype.className} egg ${subtype.eggId}`
          });
        }
        continue;
      }

      if (subtype.arrowMode === "door-by-egg-id" && Number.isInteger(subtype.eggId)) {
        for (const target of doorTargetsByQlo.get(subtype.eggId) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_DOOR_LINK_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(230, 111, 81, 0.88)",
            dashed: [5, 3],
            label: `${subtype.className} egg ${subtype.eggId}`
          });
        }
        continue;
      }

      if (subtype.arrowMode === "remorse-changer-roof-by-egg-id" && Number.isInteger(subtype.eggId)) {
        for (const target of changerRemorseRoofTargetsByQlo.get(subtype.eggId) ?? []) {
          if (!isWithinAxisAlignedLinkDistance(source, target, CHANGER_REMORSE_SCAN_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(244, 162, 97, 0.92)",
            dashed: [6, 3],
            label: `${subtype.className} roof egg ${subtype.eggId}`
          });
        }
        continue;
      }

      if (subtype.arrowMode === "regret-changer-roof-by-egg-id" && Number.isInteger(subtype.eggId)) {
        for (const target of changerRegretRoofTargetsByQlo.get(subtype.eggId) ?? []) {
          if (!isWithinAxisAlignedLinkDistance(source, target, CHANGER_REMORSE_SCAN_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(233, 151, 63, 0.92)",
            dashed: [8, 3],
            label: `${subtype.className} roof egg ${subtype.eggId}`
          });
        }
      }
    }

    const controllerShapes = new Set([BOX_EW_SHAPE, FASTSKIL_SHAPE, EVENT_SHAPE, SKILLBOX_SHAPE, PANELNS_SHAPE, PANELEW_SHAPE, CRUMORPH_SHAPE, CARD_NS_SHAPE, NPC_ONLY_SHAPE, SPANEL_SHAPE, GENERATR_SHAPE, WATCHNS_SHAPE, WATCHEW_SHAPE]);
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
                    : sourceShape === PANELEW_SHAPE
                      ? "PANELEW"
                    : sourceShape === CRUMORPH_SHAPE
                      ? "CRUMORPH"
                    : sourceShape === CARD_NS_SHAPE
                      ? "CARD_NS"
                      : sourceShape === NPC_ONLY_SHAPE
                        ? "NPC_ONLY"
                        : sourceShape === GENERATR_SHAPE
                          ? "GENERATR"
                      : sourceShape === WATCHNS_SHAPE
                        ? "WATCHNS"
                        : sourceShape === WATCHEW_SHAPE
                          ? "WATCHEW"
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

    for (const consumerShape of [MONITNS_SHAPE, MONITEW_SHAPE, WATCHNS_SHAPE, WATCHEW_SHAPE]) {
      for (const source of byShape.get(consumerShape) ?? []) {
        const qLo = getQualityLowByte(source);
        if (!Number.isInteger(qLo)) {
          continue;
        }
        for (const target of valueBoxTargetsByQlo.get(qLo) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
            continue;
          }
          const consumerLabel = consumerShape === MONITNS_SHAPE
            ? "MONITNS"
            : consumerShape === MONITEW_SHAPE
              ? "MONITEW"
              : consumerShape === WATCHNS_SHAPE
                ? "WATCHNS"
                : "WATCHEW";
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(42, 157, 143, 0.9)",
            dashed: [4, 3],
            label: `${consumerLabel} -> VALUEBOX QLo ${qLo}`
          });
        }
      }
    }

    const secretDoorPostsByQlo = new Map();
    for (const target of byShape.get(SECRET_DOOR_POST_SHAPE) ?? []) {
      const qLo = getQualityLowByte(target);
      if (!Number.isInteger(qLo)) {
        continue;
      }
      addItemToBucket(secretDoorPostsByQlo, qLo, target);
    }

    for (const watchShape of [WATCHNS_SHAPE, WATCHEW_SHAPE]) {
      for (const source of byShape.get(watchShape) ?? []) {
        const qLo = getQualityLowByte(source);
        if (!Number.isInteger(qLo)) {
          continue;
        }
        for (const target of secretDoorPostsByQlo.get(qLo) ?? []) {
          if (!isWithinLinkDistance(source, target, LOCAL_EDITOR_LINK_DISTANCE)) {
            continue;
          }
          pushUniqueLink(links, seenKeys, source, target, {
            color: "rgba(133, 211, 255, 0.86)",
            dashed: [5, 3],
            label: `${watchShape === WATCHNS_SHAPE ? "WATCHNS" : "WATCHEW"} -> secret post QLo ${qLo}`
          });
        }
      }
    }

    const pressureBarriersByQlo = new Map();
    for (const barrierShape of [PRESSURE_BARRIER_V_SHAPE, PRESSURE_BARRIER_H_SHAPE]) {
      for (const target of byShape.get(barrierShape) ?? []) {
        const qLo = getQualityLowByte(target);
        if (!Number.isInteger(qLo)) {
          continue;
        }
        addItemToBucket(pressureBarriersByQlo, qLo, target);
      }
    }

    for (const source of byShape.get(CRYOBOX_SHAPE) ?? []) {
      const qLo = getQualityLowByte(source);
      if (!Number.isInteger(qLo)) {
        continue;
      }
      for (const target of pressureBarriersByQlo.get(qLo) ?? []) {
        if (!isWithinLinkDistance(source, target, CRYOBOX_LINK_DISTANCE)) {
          continue;
        }
        pushUniqueLink(links, seenKeys, source, target, {
          color: "rgba(111, 255, 233, 0.86)",
          dashed: [4, 3],
          label: `CRYOBOX -> pressure barrier QLo ${qLo}`
        });
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
    if (shouldUseAuthoredScreenRect(item)) {
      return null;
    }

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

  function drawStyledPolygonOverlay(targetContext, scale, offsetX, offsetY, geometry, item, styles, alpha = 1) {
    if (!geometry) {
      return;
    }

    const fillAlpha = styles.fillAlpha ?? 0;
    const fillRgb = styles.fillRgb ?? null;
    const strokeRgb = styles.strokeRgb ?? "255, 255, 255";
    const connectorRgb = styles.connectorRgb ?? strokeRgb;
    const strokeAlpha = styles.strokeAlpha ?? 0.9;
    const connectorAlpha = styles.connectorAlpha ?? 0.6;

    targetContext.save();
    if (fillRgb && fillAlpha > 0) {
      targetContext.fillStyle = `rgba(${fillRgb}, ${fillAlpha * alpha})`;
      drawScenePolygon(targetContext, scale, offsetX, offsetY, geometry.hitPolygon);
      targetContext.fill();
    }
    targetContext.strokeStyle = `rgba(${strokeRgb}, ${strokeAlpha * alpha})`;
    targetContext.lineWidth = styles.lineWidth ?? 1.5;
    targetContext.setLineDash(styles.dash ?? []);
    drawBoundingGeometry(targetContext, scale, offsetX, offsetY, geometry);
    if (item) {
      targetContext.strokeStyle = `rgba(${connectorRgb}, ${connectorAlpha * alpha})`;
      targetContext.setLineDash(styles.connectorDash ?? styles.dash ?? []);
      drawRangeConnector(targetContext, scale, offsetX, offsetY, geometry, item);
    }
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

    if (!alwaysShowRangesCheckbox.checked && !showAltF7SnapRangesCheckbox.checked && !showCtrlF7EggRangesCheckbox.checked && overlay.itemId) {
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

  function drawF7WorldGrid(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, timestamp) {
    if (!state.current || !showF7GridCheckbox.checked) {
      return;
    }

    const geometries = getWorldGridGeometries(canvasWidth, canvasHeight, scale, offsetX, offsetY);
    if (!geometries.length) {
      return;
    }

    targetContext.save();
    targetContext.strokeStyle = `rgba(${getOverlayPaletteRgb(OVERLAY_PALETTE_INDEX.f7, timestamp)}, 0.92)`;
    targetContext.lineWidth = 1;
    targetContext.setLineDash([]);
    for (const geometry of geometries) {
      drawBoundingGeometry(targetContext, scale, offsetX, offsetY, geometry);
    }
    targetContext.restore();
  }

  function drawCtrlF7EggRanges(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, timestamp, hiddenIds = new Set()) {
    if (!state.current || !showCtrlF7EggRangesCheckbox.checked) {
      return;
    }

    for (const item of state.current.scene.items) {
      if (hiddenIds.has(item.id)) {
        continue;
      }

      const geometry = getEggHatcherRangeGeometry(item);
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

      drawStyledPolygonOverlay(targetContext, scale, offsetX, offsetY, geometry, item, buildOverlayPaletteStyles(OVERLAY_PALETTE_INDEX.ctrlF7, timestamp, {
        fillAlpha: 0,
        strokeAlpha: 0.92,
        connectorAlpha: 0.72,
        dash: [],
        connectorDash: [],
        lineWidth: 1
      }));
    }
  }

  function drawAltF7SnapRanges(targetContext, canvasWidth, canvasHeight, scale, offsetX, offsetY, timestamp, hiddenIds = new Set()) {
    if (!state.current || !showAltF7SnapRangesCheckbox.checked) {
      return;
    }

    for (const item of state.current.scene.items) {
      if (hiddenIds.has(item.id)) {
        continue;
      }

      const geometry = getSnapCoverageGeometry(item);
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

      drawStyledPolygonOverlay(targetContext, scale, offsetX, offsetY, geometry, item, buildOverlayPaletteStyles(OVERLAY_PALETTE_INDEX.altF7, timestamp, {
        fillAlpha: 0,
        strokeAlpha: 0.88,
        connectorAlpha: 0.68,
        dash: [],
        connectorDash: [],
        lineWidth: 1
      }));
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
    drawF7WorldGrid(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, timestamp);
    drawRangeOverlays(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
    drawAltF7SnapRanges(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, timestamp, state.current?.hiddenIds ?? new Set());
    drawCtrlF7EggRanges(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, timestamp, state.current?.hiddenIds ?? new Set());
    drawLinkArrows(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
    drawBoundingBoxes(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
    drawEggLabels(context, viewport.clientWidth, viewport.clientHeight);
    syncOverlayState();
    drawHighlightOverlay(context, state.zoom, state.offsetX, state.offsetY, timestamp);
    if (hasAnimatedPaletteCycleOverlay()) {
      scheduleRender();
    }
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
    getArrowGraph,
    getFilteredEggs,
    getItemDisplay,
    getVisibleNpcPreviewItems,
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
