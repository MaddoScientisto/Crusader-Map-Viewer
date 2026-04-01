import {
  getHistorySelection,
  readViewerHistoryState,
  updateViewerHistory
} from "../../shared/viewer-history.js";
import { getReferenceDataPath } from "../../shared/runtime-adapter.js";
import { getNpcSpawnerInfo } from "../../public/npc-spawner-data.js";
import { buildEggMetadataFromDefinition } from "../../public/egg-utils.js";
import { unpackCompactMapSourceItems, unpackCompactSceneItems } from "../../shared/compact-scene-codec.js";

const FLAG_INVISIBLE = 0x0010;
const FLAG_FLIPPED = 0x0020;
const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const ITEM_PREVIEW_SPAWNER_SHAPE = 0x0476;
const OBSERVER_PREVIEW_FRAME = 0x0f;

function buildStableSceneItemId(rawItem) {
  if (rawItem.source === "fixed" && Number.isInteger(rawItem.mapSourceIndex)) {
    return `fixed:${rawItem.mapSourceIndex}`;
  }
  return [
    rawItem.source,
    rawItem.shape,
    rawItem.frame,
    rawItem.x,
    rawItem.y,
    rawItem.z,
    rawItem.mapNum,
    rawItem.npcNum,
    rawItem.quality,
    rawItem.nextItem
  ].join(":");
}
const CATALOG_SEMITRANSPARENCY_OPACITY = 0.5;

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function sceneLabel(kind) {
  switch (kind) {
    case "helper":
      return "Helper Geometry";
    case "egg":
      return "Egg Trigger";
    case "roof":
      return "Roof Shape";
    case "terrain":
      return "Terrain Shape";
    case "editor":
      return "Editor Object";
    default:
      return "Map Shape";
  }
}

function deriveSceneKind(definition, flags) {
  if ((flags & FLAG_INVISIBLE) || definition?.traits?.occluding || definition?.traits?.invitem) {
    return "helper";
  }
  if ([3, 4, 7, 8].includes(definition?.family)) {
    return "egg";
  }
  if (definition?.traits?.roof) {
    return "roof";
  }
  if (definition?.traits?.land) {
    return "terrain";
  }
  if (definition?.traits?.editor) {
    return "editor";
  }
  return definition?.kind ?? "base";
}

function deriveSceneNotes(definition, flags) {
  const notes = [];
  if (flags & FLAG_INVISIBLE) {
    notes.push("invisible-flagged");
  }
  if (definition?.traits?.occluding) {
    notes.push("occluding-geometry");
  }
  if (definition?.traits?.invitem) {
    notes.push("invitem-family");
  }
  if ([3, 4, 7, 8].includes(definition?.family)) {
    notes.push("egg-family");
  }
  if (definition?.traits?.roof) {
    notes.push("roof-flagged");
  }
  if (definition?.traits?.translucent) {
    notes.push("translucent");
  }
  if (definition?.traits?.editor) {
    notes.push("editor-record");
  }
  if (definition?.traits?.oob) {
    notes.push("oob-surface");
  }
  return notes;
}

function derivePresentationOpacity(definition) {
  if (definition?.catalogEntry?.semitransparency === true && definition?.traits?.translucent !== true) {
    return CATALOG_SEMITRANSPARENCY_OPACITY;
  }
  return 1;
}

function buildScreenRect(world, sprite, flags, bounds) {
  const sxBot = Math.trunc(world.x / 4 - world.y / 4) - (bounds?.screenLeft ?? 0);
  const syBot = Math.trunc(world.x / 8 + world.y / 8 - world.z) - (bounds?.screenTop ?? 0);
  const left = (flags & FLAG_FLIPPED) ? sxBot + sprite.xoff - sprite.width : sxBot - sprite.xoff;
  const top = syBot - sprite.yoff;
  const right = left + sprite.width;
  const bottom = top + sprite.height;
  return {
    left,
    top,
    right,
    bottom,
    width: sprite.width,
    height: sprite.height,
    anchorX: Math.trunc(left + sprite.width / 2),
    anchorY: bottom
  };
}

function buildSpriteFrameIndex(sprites) {
  const spriteIndex = new Map();
  const spriteFramesByShape = new Map();
  for (const sprite of sprites ?? []) {
    spriteIndex.set(sprite.id, sprite);
    const frames = spriteFramesByShape.get(sprite.shape) ?? [];
    frames.push(sprite.frame);
    spriteFramesByShape.set(sprite.shape, frames);
  }
  for (const frames of spriteFramesByShape.values()) {
    frames.sort((left, right) => left - right);
  }
  return { spriteIndex, spriteFramesByShape };
}

function choosePreviewFrame(shape, preferredFrame, spriteFramesByShape) {
  const frames = spriteFramesByShape.get(shape) ?? [];
  if (!frames.length) {
    return null;
  }
  if (frames.includes(preferredFrame)) {
    return preferredFrame;
  }
  return frames[frames.length - 1] ?? null;
}

function buildNpcPreview(item, definition, gameId, spriteFramesByShape) {
  if (!Number.isInteger(item?.npcNum) || item.npcNum <= 0) {
    return null;
  }
  const canUsePreview = DTABLE_NPC_SHAPES.has(definition?.shape)
    || (definition?.shape === MONSTER_EGG_PREVIEW_SHAPE && item.frame === 0 && item.egg?.type === "monster-spawn");
  if (!canUsePreview) {
    return null;
  }

  const row = getNpcSpawnerInfo(gameId, item.npcNum);
  if (!row || !Number.isInteger(row.shape) || row.shape < 0) {
    return null;
  }

  const preferredFrame = row.name?.trim().toLowerCase() === "observer" ? OBSERVER_PREVIEW_FRAME : 0;
  const frame = choosePreviewFrame(row.shape, preferredFrame, spriteFramesByShape);
  if (!Number.isInteger(frame)) {
    return null;
  }

  return {
    index: row.index,
    name: row.name,
    shape: row.shape,
    shapeHex: toHex(row.shape),
    frame,
    shapeDefId: `shape:${row.shape}`,
    spriteId: `sprite:${row.shape}:${frame}`
  };
}

function buildItemPreview(item, definition, shapeDefinitionIndex, spriteFramesByShape) {
  if (definition?.shape !== ITEM_PREVIEW_SPAWNER_SHAPE || !Number.isInteger(item?.npcNum) || !Number.isInteger(item?.mapNum)) {
    return null;
  }

  const shape = (item.mapNum & 0xffff) + ((item.npcNum & 0x00e0) * 8);
  if (!shapeDefinitionIndex.has(`shape:${shape}`)) {
    return null;
  }

  const rawFrame = item.npcNum & 0x0f;
  const frame = choosePreviewFrame(shape, rawFrame, spriteFramesByShape);
  if (!Number.isInteger(frame)) {
    return null;
  }

  return {
    shape,
    shapeHex: toHex(shape),
    frame,
    rawFrame,
    shapeDefId: `shape:${shape}`,
    spriteId: `sprite:${shape}:${frame}`
  };
}

function materializeMapSource(mapSource) {
  if (!mapSource || Array.isArray(mapSource.items) || !mapSource.itemEncoding) {
    return mapSource;
  }
  const { itemEncoding, ...mapSourceWithoutEncoding } = mapSource;
  return {
    ...mapSourceWithoutEncoding,
    items: unpackCompactMapSourceItems(itemEncoding)
  };
}

function materializeCompactSceneItems(selected, scene, shapeDefinitions, sprites) {
  if (Array.isArray(scene?.items)) {
    return scene.items;
  }
  if (!scene?.itemEncoding) {
    return [];
  }

  const rawItems = unpackCompactSceneItems(scene.itemEncoding);
  const shapeDefinitionIndex = new Map((shapeDefinitions ?? []).map((definition) => [definition.id, definition]));
  const { spriteIndex, spriteFramesByShape } = buildSpriteFrameIndex(sprites ?? []);

  return rawItems.map((rawItem, index) => {
    const shapeDefId = `shape:${rawItem.shape}`;
    const spriteId = `sprite:${rawItem.shape}:${rawItem.frame}`;
    const definition = shapeDefinitionIndex.get(shapeDefId);
    const sprite = spriteIndex.get(spriteId);
    if (!definition) {
      throw new Error(`Scene payload is missing shape definition ${shapeDefId}`);
    }
    if (!sprite) {
      throw new Error(`Scene payload is missing sprite ${spriteId}`);
    }

    const kind = deriveSceneKind(definition, rawItem.flags);
    const world = {
      x: rawItem.x,
      y: rawItem.y,
      z: rawItem.z
    };
    const item = {
      id: `item:${index}:${rawItem.source}:${rawItem.shape}:${rawItem.frame}:${rawItem.x}:${rawItem.y}:${rawItem.z}`,
      stableId: buildStableSceneItemId(rawItem),
      mapSourceIndex: Number.isInteger(rawItem.mapSourceIndex) ? rawItem.mapSourceIndex : null,
      drawOrder: index,
      kind,
      label: sceneLabel(kind),
      source: rawItem.source,
      world,
      mapNum: rawItem.mapNum,
      npcNum: rawItem.npcNum,
      nextItem: rawItem.nextItem,
      quality: rawItem.quality,
      frame: rawItem.frame,
      screen: buildScreenRect(world, sprite, rawItem.flags, scene?.metadata?.bounds),
      flags: {
        raw: rawItem.flags,
        hex: toHex(rawItem.flags),
        invisible: Boolean(rawItem.flags & FLAG_INVISIBLE),
        flipped: Boolean(rawItem.flags & FLAG_FLIPPED)
      },
      presentation: {
        opacity: derivePresentationOpacity(definition),
        visibilityDefault: true
      },
      notes: deriveSceneNotes(definition, rawItem.flags),
      frameSize: {
        width: sprite.width,
        height: sprite.height,
        xoff: sprite.xoff,
        yoff: sprite.yoff
      },
      egg: null,
      npcPreview: null,
      itemPreview: null,
      shapeDefId,
      spriteId
    };

    item.egg = [3, 4, 7, 8].includes(definition?.family)
      ? buildEggMetadataFromDefinition(item, definition)
      : null;
    item.npcPreview = buildNpcPreview(item, definition, selected?.game ?? null, spriteFramesByShape);
    item.itemPreview = buildItemPreview(item, definition, shapeDefinitionIndex, spriteFramesByShape);
    return item;
  });
}

export function createSceneRuntimeController(deps) {
  const USECODE_STATE_EVENT = "crusader-map-renderer:scene-changed";
  const {
    state,
    viewport,
    overlayTooltip,
    panelResizer,
    mapForm,
    versionSelect,
    mapSelect,
    mapPrevButton,
    mapNextButton,
    includeEditorCheckbox,
    showEditorLinkArrowsCheckbox,
    alwaysShowRangesCheckbox,
    showF7GridCheckbox,
    showAltF7SnapRangesCheckbox,
    showCtrlF7EggRangesCheckbox,
    alwaysShowNpcPreviewsCheckbox,
    alwaysShowItemPreviewsCheckbox,
    includeRoofsCheckbox,
    includeOobCheckbox,
    showBoundingBoxesCheckbox,
    showLinkArrowsCheckbox,
    inspectShapesCheckbox,
    showEggLabelsCheckbox,
    addEggButton,
    addDestinationEggButton,
    eggPlacementIdInput,
    monsterSpawnerFilterBlockedCheckbox,
    downloadButton,
    downloadSceneJsonButton,
    downloadMapBinaryButton,
    downloadAtlasButton,
    hiddenExportButton,
    reloadMapButton,
    zoomInButton,
    zoomOutButton,
    zoomResetButton,
    zoomFitButton,
    eggSection,
    monsterSpawnerSection,
    includeEditorCheckbox: includeEditor,
    includeRoofsCheckbox: includeRoofs,
    includeOobCheckbox: includeOob,
    getSelectedMap,
    rememberSelection,
    syncVersionSelection,
    updateMapNavigationState,
    stepSelectedMap,
    currentSelectionMatches,
    applySiteConfig,
    populateCatalog,
    getStaticSceneUrl,
    getDynamicBuildsUrl,
    getDynamicBuildStatusUrl,
    getDynamicSceneUrl,
    getAtlasUrl,
    loadSceneAssets,
    isStaticMode,
    appUrl,
    getCatalogDataPath,
    fetchJson,
    loadSiteConfig,
    loadNpcSpawnerData,
    cloneMapSource,
    sortEggItems,
    nextTeleportEggId,
    resizeCanvas,
    clampOffsets,
    setZoom,
    fitMap,
    scheduleRender,
    drawSceneToContext,
    hideOverlayTooltip,
    hideInspectHighlight,
    updateHiddenList,
    renderEggList,
    renderMonsterSpawnerList,
    syncOverlayState,
    setEggPlacementWarning,
    updateEggPlacementButtonState,
    updateViewportModeHint,
    isEditorSelectableItem,
    isEggItem,
    isItemVisible,
    canPinItem,
    canKeepPinnedItemVisible,
    canKeepHoverItemVisible,
    pointHitsItem,
    updateMonsterSpawnerListSelection,
    updateEggListSelection,
    resetRenderCaches,
    setStatus,
    setLoadingState,
    setMeta,
    setDownloadState,
    setSceneJsonDownloadState,
    setMapBinaryDownloadState,
    setAtlasDownloadState,
    setHiddenExportState,
    setReloadState,
    setEmptyStateVisible,
    enableZoomControls,
    closeEggEditModal,
    isEggEditOpen,
    cancelEggPlacement,
    updateEggPlacementPreview,
    placePendingTeleportEgg,
    toggleEggPlacementMode,
    duplicateTeleportWarning,
    normalizeTeleportId,
    isTypingTarget,
    canEditCatalog,
    undoLastCatalogEdit,
    getItemById,
    getItemDisplay,
    getMonsterSpawnerItems,
    EGG_FILTERS,
    ZOOM_FACTOR
  } = deps;

  let autoBuildTimer = null;
  let historyRestoreInProgress = false;
  let historyInitialized = false;
  const VIEWER_PREFERENCES_STORAGE_KEY = "crusader-map-renderer:viewer-preferences";
  const persistedCheckboxes = [
    ["includeEditor", includeEditorCheckbox],
    ["showEditorLinkArrows", showEditorLinkArrowsCheckbox],
    ["alwaysShowRanges", alwaysShowRangesCheckbox],
    ["showF7Grid", showF7GridCheckbox],
    ["showAltF7SnapRanges", showAltF7SnapRangesCheckbox],
    ["showCtrlF7EggRanges", showCtrlF7EggRangesCheckbox],
    ["alwaysShowNpcPreviews", alwaysShowNpcPreviewsCheckbox],
    ["alwaysShowItemPreviews", alwaysShowItemPreviewsCheckbox],
    ["includeRoofs", includeRoofsCheckbox],
    ["includeOob", includeOobCheckbox],
    ["showBoundingBoxes", showBoundingBoxesCheckbox],
    ["showLinkArrows", showLinkArrowsCheckbox],
    ["inspectShapes", inspectShapesCheckbox],
    ["showEggLabels", showEggLabelsCheckbox],
    ["eggFilterTeleportDestination", EGG_FILTERS[0]?.checkbox],
    ["eggFilterTeleporter", EGG_FILTERS[1]?.checkbox],
    ["eggFilterMonster", EGG_FILTERS[2]?.checkbox],
    ["eggFilterUsecode", EGG_FILTERS[3]?.checkbox],
    ["eggFilterGlob", EGG_FILTERS[4]?.checkbox],
    ["monsterSpawnerFilterBlocked", monsterSpawnerFilterBlockedCheckbox]
  ].filter(([, checkbox]) => Boolean(checkbox));

  function readViewerPreferences() {
    try {
      const raw = window.localStorage?.getItem(VIEWER_PREFERENCES_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeViewerPreferences() {
    try {
      const options = Object.fromEntries(
        persistedCheckboxes.map(([key, checkbox]) => [key, checkbox.checked])
      );
      window.localStorage?.setItem(
        VIEWER_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          selectedVersion: versionSelect.value,
          selectedMap: getSelectedMap(),
          selectionMemory: state.selectionMemory,
          viewMemory: state.viewMemory,
          options
        })
      );
    } catch {
      // Ignore storage failures so the viewer still works in restricted environments.
    }
  }

  function restoreViewerOptions(preferences) {
    const options = preferences?.options;
    if (!options || typeof options !== "object") {
      return;
    }
    for (const [key, checkbox] of persistedCheckboxes) {
      if (typeof options[key] === "boolean") {
        checkbox.checked = options[key];
      }
    }

    if (typeof options.alwaysShowRanges === "boolean" && typeof options.showCtrlF7EggRanges !== "boolean") {
      showCtrlF7EggRangesCheckbox.checked = options.alwaysShowRanges;
    }
  }

  function restoreSelectionMemory(preferences) {
    const selectionMemory = preferences?.selectionMemory;
    if (!selectionMemory || typeof selectionMemory !== "object") {
      return;
    }
    state.selectionMemory = {
      byFamily: selectionMemory.byFamily && typeof selectionMemory.byFamily === "object" ? { ...selectionMemory.byFamily } : {},
      byVersion: selectionMemory.byVersion && typeof selectionMemory.byVersion === "object" ? { ...selectionMemory.byVersion } : {}
    };
  }

  function restoreViewMemory(preferences) {
    const viewMemory = preferences?.viewMemory;
    if (!viewMemory || typeof viewMemory !== "object") {
      return;
    }
    state.viewMemory = {
      byFamily: viewMemory.byFamily && typeof viewMemory.byFamily === "object" ? { ...viewMemory.byFamily } : {},
      byVersion: viewMemory.byVersion && typeof viewMemory.byVersion === "object" ? { ...viewMemory.byVersion } : {}
    };
  }

  function getVersionForGameId(gameId) {
    if (!gameId || !state.catalog?.games?.length) {
      return null;
    }
    return state.catalog.games.find((game) => game.id === gameId) ?? null;
  }

  function selectionsShareFamily(left, right) {
    if (!left?.game || !right?.game) {
      return false;
    }
    const leftVersion = getVersionForGameId(left.game);
    const rightVersion = getVersionForGameId(right.game);
    return Boolean(leftVersion && rightVersion && leftVersion.gameId === rightVersion.gameId);
  }

  function syncSelectionHistory(selected) {
    if (!selected) {
      return;
    }
    updateViewerHistory(
      {
        game: selected.game,
        mapId: selected.mapId
      },
      {
        replace: historyRestoreInProgress || !historyInitialized
      }
    );
    historyInitialized = true;
  }

  function snapshotViewport(selected = state.current?.selected ?? null) {
    if (!selected || !Number.isInteger(selected.mapId)) {
      return null;
    }
    return {
      game: selected.game,
      mapId: selected.mapId,
      zoom: state.zoom,
      offsetX: state.offsetX,
      offsetY: state.offsetY
    };
  }

  function rememberViewport(selected = state.current?.selected ?? null) {
    const snapshot = snapshotViewport(selected);
    if (!snapshot) {
      return;
    }
    const version = getVersionForGameId(snapshot.game);
    if (!version) {
      return;
    }
    state.viewMemory.byVersion[snapshot.game] = snapshot;
    state.viewMemory.byFamily[version.gameId] = snapshot;
  }

  function applyViewport(viewState) {
    if (!viewState) {
      return false;
    }
    const zoomBounds = state.current?.metadata?.zoom;
    if (zoomBounds) {
      state.zoom = Math.min(zoomBounds.max, Math.max(zoomBounds.min, viewState.zoom));
    } else {
      state.zoom = viewState.zoom;
    }
    state.offsetX = viewState.offsetX;
    state.offsetY = viewState.offsetY;
    clampOffsets();
    scheduleRender();
    return true;
  }

  function resolveViewportForSelection(selected) {
    if (!selected || !Number.isInteger(selected.mapId)) {
      return null;
    }

    const currentSelection = state.current?.selected ?? null;
    if (
      currentSelection
      && currentSelection.mapId === selected.mapId
      && (currentSelectionMatches(selected) || selectionsShareFamily(currentSelection, selected))
    ) {
      return snapshotViewport(currentSelection);
    }

    const versionView = state.viewMemory.byVersion[selected.game];
    if (versionView?.mapId === selected.mapId) {
      return versionView;
    }

    const version = getVersionForGameId(selected.game);
    const familyView = version ? state.viewMemory.byFamily[version.gameId] : null;
    if (familyView?.mapId === selected.mapId) {
      return familyView;
    }

    return null;
  }

  function restoreSelectedMap(preferences) {
    const selectedVersion = String(preferences?.selectedVersion ?? "");
    if (selectedVersion && [...versionSelect.options].some((option) => option.value === selectedVersion)) {
      versionSelect.value = selectedVersion;
    }

    const selectedMap = preferences?.selectedMap;
    syncVersionSelection(selectedMap && typeof selectedMap === "object" ? selectedMap : null);
    writeViewerPreferences();
    return Boolean(getSelectedMap());
  }

  function getSelectedGameLabel(selected) {
    return state.catalog?.games?.find((game) => game.id === selected?.game)?.label ?? selected?.game ?? "unknown game";
  }

  function clientToScenePoint(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.offsetX) / state.zoom,
      y: (clientY - rect.top - state.offsetY) / state.zoom
    };
  }

  function findItemAtPoint(point) {
    if (!state.current) {
      return null;
    }
    const items = state.current.scene.items;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (pointHitsItem(point, item)) {
        return item;
      }
    }
    return null;
  }

  function updateInspectHover(event) {
    state.lastPointerClient = { x: event.clientX, y: event.clientY };
    if (state.eggPlacement) {
      updateEggPlacementPreview(event.clientX, event.clientY);
      return;
    }
    if (!state.current || state.pinnedItemId) {
      return;
    }
    const item = findItemAtPoint(clientToScenePoint(event.clientX, event.clientY));
    if (!inspectShapesCheckbox.checked && !isEditorSelectableItem(item) && !isEggItem(item)) {
      state.hoverItemId = null;
      syncOverlayState();
      scheduleRender();
      return;
    }
    state.hoverItemId = item?.id ?? null;
    syncOverlayState();
    scheduleRender();
  }

  function refreshHoverFromLastPointer() {
    if (!state.current || state.pinnedItemId || !state.lastPointerClient || state.eggPlacement) {
      return;
    }
    const item = findItemAtPoint(clientToScenePoint(state.lastPointerClient.x, state.lastPointerClient.y));
    if (!inspectShapesCheckbox.checked && !isEditorSelectableItem(item) && !isEggItem(item)) {
      state.hoverItemId = null;
      return;
    }
    state.hoverItemId = item?.id ?? null;
  }

  function toggleHidden(itemId, nextHidden = null) {
    if (!state.current) {
      return;
    }
    const shouldHide = nextHidden ?? !state.current.hiddenIds.has(itemId);
    if (shouldHide) {
      state.current.hiddenIds.add(itemId);
      state.current.visibilityRevision = (state.current.visibilityRevision ?? 0) + 1;
      if (state.pinnedItemId === itemId) {
        state.pinnedItemId = null;
      }
      if (state.hoverItemId === itemId) {
        state.hoverItemId = null;
      }
      refreshHoverFromLastPointer();
      syncOverlayState();
    } else {
      state.current.hiddenIds.delete(itemId);
      state.current.visibilityRevision = (state.current.visibilityRevision ?? 0) + 1;
    }
    updateHiddenList();
    setMeta(state.current.metadata);
    scheduleRender();
  }

  function setInspectMode(active) {
    viewport.classList.toggle("inspect-active", active);
    if (!active) {
      state.hoverItemId = null;
      if (!canKeepPinnedItemVisible()) {
        state.pinnedItemId = null;
        hideInspectHighlight();
        hideOverlayTooltip();
      } else {
        syncOverlayState();
      }
    } else {
      syncOverlayState();
    }
    updateViewportModeHint();
  }

  async function downloadCurrentScene() {
    if (!state.current) {
      return;
    }
    const { width, height } = state.current.metadata.bounds;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, width);
    exportCanvas.height = Math.max(1, height);
    const exportContext = exportCanvas.getContext("2d", { alpha: true });
    exportContext.imageSmoothingEnabled = false;
    drawSceneToContext(exportContext, width, height, 1, 0, 0, state.current.hiddenIds);

    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Failed to encode PNG export"));
        }
      }, "image/png");
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.current.selected.game}-map-${state.current.selected.mapId}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildCurrentSceneJsonPayload() {
    if (!state.current) {
      return null;
    }

    return {
      ...state.current.scene,
      exportedAt: new Date().toISOString(),
      exportMode: "viewer-scene-json"
    };
  }

  function downloadCurrentSceneJson() {
    const payload = buildCurrentSceneJsonPayload();
    if (!payload || !state.current) {
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${state.current.selected.game}-map-${state.current.selected.mapId}-scene.json`);
  }

  function writeU16LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
  }

  function canDownloadCurrentMapBinary() {
    return Boolean(
      state.current?.mapSource
      && state.current.mapSource.formatVersion === "crusader-fixed-map-v1"
      && state.current.mapSource.binaryExportSupported !== false
    );
  }

  function buildCurrentMapBinaryPayload() {
    if (!canDownloadCurrentMapBinary()) {
      return null;
    }
    const bytes = new Uint8Array(state.current.mapSource.items.length * state.current.mapSource.itemRecordSize);
    state.current.mapSource.items.forEach((item, index) => {
      const offset = index * state.current.mapSource.itemRecordSize;
      writeU16LE(bytes, offset, item.x / 2);
      writeU16LE(bytes, offset + 2, item.y / 2);
      bytes[offset + 4] = item.z & 0xff;
      writeU16LE(bytes, offset + 5, item.shape);
      bytes[offset + 7] = item.frame & 0xff;
      writeU16LE(bytes, offset + 8, item.flags);
      writeU16LE(bytes, offset + 10, item.quality);
      bytes[offset + 12] = item.npcNum & 0xff;
      bytes[offset + 13] = item.mapNum & 0xff;
      writeU16LE(bytes, offset + 14, item.nextItem);
    });
    return bytes;
  }

  function downloadCurrentMapBinary() {
    const payload = buildCurrentMapBinaryPayload();
    if (!payload || !state.current?.mapSource) {
      return;
    }
    const blob = new Blob([payload], { type: "application/octet-stream" });
    downloadBlob(blob, state.current.mapSource.exportFileName || `${state.current.selected.game}-map-${state.current.selected.mapId}.bin`);
  }

  async function downloadCurrentAtlases() {
    if (!state.current) {
      return;
    }

    const { scene, selected, jobId } = state.current;
    if (!scene.atlases.length) {
      return;
    }

    setStatus(`Downloading ${scene.atlases.length} atlas image${scene.atlases.length === 1 ? "" : "s"} for ${selected.game} map ${selected.mapId}...`);
    for (const atlas of scene.atlases) {
      const fileName = atlas.fileName || `${selected.game}-map-${selected.mapId}-atlas-${atlas.id}.png`;
      await downloadByUrl(getAtlasUrl(selected, jobId, atlas), fileName);
    }
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadByUrl(url, fileName) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    downloadBlob(blob, fileName);
  }

  function buildHiddenExportPayload() {
    if (!state.current) {
      return null;
    }

    const grouped = new Map();
    for (const itemId of state.current.hiddenIds) {
      const item = getItemById(itemId);
      if (!item) {
        continue;
      }
      const display = getItemDisplay(item);
      if (!grouped.has(item.shapeDefId)) {
        grouped.set(item.shapeDefId, {
          shapeDefId: item.shapeDefId,
          shape: display.definition?.shape ?? null,
          shapeHex: display.shapeHex,
          displayName: display.displayName,
          kind: display.kind,
          hiddenItemIds: []
        });
      }
      grouped.get(item.shapeDefId).hiddenItemIds.push(item.id);
    }

    return {
      game: state.current.selected.game,
      mapId: state.current.selected.mapId,
      includeEditor: includeEditor.checked,
      includeRoofs: includeRoofs.checked,
      includeOob: includeOob.checked,
      exportedAt: new Date().toISOString(),
      hiddenShapes: [...grouped.values()].sort((left, right) => left.shapeHex.localeCompare(right.shapeHex))
    };
  }

  function getCatalogGameEntry(gameId) {
    if (!state.catalog?.games?.length) {
      return null;
    }
    return state.catalog.games.find((game) => game.id === gameId) ?? null;
  }

  function getSceneReferenceId(selected, scene) {
    return scene?.references?.referenceId
      ?? getCatalogGameEntry(selected?.game)?.referenceId
      ?? selected?.game
      ?? null;
  }

  async function loadReferenceDefinitions(referenceId) {
    if (!referenceId) {
      return {
        shapeDefinitions: [],
        sprites: [],
        atlases: []
      };
    }
    const cached = state.referenceDataByGame.get(referenceId);
    if (cached) {
      return cached;
    }

    const payload = await fetchJson(appUrl(getReferenceDataPath(state.siteConfig, referenceId)));
    state.referenceDataByGame.set(referenceId, payload);
    return payload;
  }

  async function materializeScene(selected, scene) {
    const { itemEncoding, ...sceneWithoutItemEncoding } = scene ?? {};
    if (Array.isArray(scene?.shapeDefinitions) && Array.isArray(scene?.sprites) && Array.isArray(scene?.atlases)) {
      return {
        ...sceneWithoutItemEncoding,
        items: materializeCompactSceneItems(selected, scene, scene.shapeDefinitions, scene.sprites),
        mapSource: materializeMapSource(scene.mapSource),
        metadata: scene.metadata?.gameLabel
          ? scene.metadata
          : {
              ...scene.metadata,
              gameLabel: getSelectedGameLabel(selected)
            }
      };
    }

    const referenceId = getSceneReferenceId(selected, scene);
    const shapeDefinitionIds = scene?.references?.shapeDefinitionIds ?? [];
    const spriteIds = scene?.references?.spriteIds ?? [];
    const atlasIds = scene?.references?.atlasIds ?? [];
    const referenceDefinitions = await loadReferenceDefinitions(referenceId);
    const shapeDefinitionIndex = new Map((referenceDefinitions.shapeDefinitions ?? []).map((definition) => [definition.id, definition]));
    const spriteIndex = new Map((referenceDefinitions.sprites ?? []).map((sprite) => [sprite.id, sprite]));
    const atlasIndex = new Map((referenceDefinitions.atlases ?? []).map((atlas) => [atlas.id, atlas]));
    const shapeDefinitions = shapeDefinitionIds.map((id) => shapeDefinitionIndex.get(id)).filter(Boolean);
    const sprites = spriteIds.map((id) => spriteIndex.get(id)).filter(Boolean);
    const atlases = atlasIds.map((id) => atlasIndex.get(id)).filter(Boolean);

    if (shapeDefinitions.length !== shapeDefinitionIds.length) {
      const missingIds = shapeDefinitionIds.filter((id) => !shapeDefinitionIndex.has(id));
      throw new Error(`Scene reference data is missing shape definitions for ${missingIds.slice(0, 5).join(", ")}`);
    }
    if (sprites.length !== spriteIds.length) {
      const missingIds = spriteIds.filter((id) => !spriteIndex.has(id));
      throw new Error(`Scene reference data is missing sprites for ${missingIds.slice(0, 5).join(", ")}`);
    }
    if (atlases.length !== atlasIds.length) {
      const missingIds = atlasIds.filter((id) => !atlasIndex.has(id));
      throw new Error(`Scene reference data is missing atlases for ${missingIds.slice(0, 5).join(", ")}`);
    }

    const items = materializeCompactSceneItems(selected, scene, shapeDefinitions, sprites);

    return {
      ...sceneWithoutItemEncoding,
      atlases,
      sprites,
      shapeDefinitions,
      items,
      mapSource: materializeMapSource(scene.mapSource),
      metadata: {
        ...scene.metadata,
        gameLabel: scene.metadata?.gameLabel ?? getSelectedGameLabel(selected)
      }
    };
  }

  async function exportHiddenShapes() {
    const payload = buildHiddenExportPayload();
    if (!payload) {
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${payload.game}-map-${payload.mapId}-hidden-shapes.json`);
  }

  function applyLoadedScene(selected, jobId, scene, atlasImages, preservedView = null) {
    const editableMapSource = cloneMapSource(scene.mapSource);
    scene.mapSource = editableMapSource;
    resetRenderCaches();
    state.current = {
      selected,
      jobId,
      metadata: scene.metadata,
      scene,
      mapSource: editableMapSource,
      atlasImages,
      spriteIndex: new Map(scene.sprites.map((sprite) => [sprite.id, sprite])),
      shapeDefinitions: new Map(scene.shapeDefinitions.map((definition) => [definition.id, definition])),
      itemIndex: new Map(scene.items.map((item) => [item.id, item])),
      eggs: sortEggItems(scene.items),
      hiddenIds: new Set(),
      dataRevision: 0,
      visibilityRevision: 0
    };
    state.eggPlacement = null;
    state.hoverItemId = null;
    state.pinnedItemId = state.pendingPinnedItemId && state.current.itemIndex.has(state.pendingPinnedItemId) ? state.pendingPinnedItemId : null;
    state.pendingPinnedItemId = null;
    setMeta(scene.metadata);
    updateHiddenList();
    setDownloadState(scene.items.length > 0);
    setSceneJsonDownloadState(true);
    setMapBinaryDownloadState(canDownloadCurrentMapBinary());
    setAtlasDownloadState(scene.atlases.length > 0, scene.atlases.length);
    setHiddenExportState(false);
    setReloadState(true);
    setEmptyStateVisible(false);
    enableZoomControls(true);
    eggSection.open = state.current.eggs.length > 0;
    eggPlacementIdInput.value = String(nextTeleportEggId());
    setEggPlacementWarning("");
    updateEggPlacementButtonState();
    updateViewportModeHint();
    renderEggList();
    renderMonsterSpawnerList();
    monsterSpawnerSection.open = getMonsterSpawnerItems().length > 0;

    if (!applyViewport(preservedView)) {
      fitMap();
    }
    rememberViewport(selected);
    writeViewerPreferences();
    syncSelectionHistory(selected);
    window.dispatchEvent(new CustomEvent(USECODE_STATE_EVENT, { detail: { game: selected.game, mapId: selected.mapId } }));
  }

  async function loadStaticScene(selected, token, preservedView) {
    setLoadingState(true, { phase: "loading-static-scene" });
    setStatus(
      preservedView
        ? `Reloading prebuilt ${getSelectedGameLabel(selected)} map ${selected.mapId}. The current camera stays in place until the new scene is ready.`
        : `Loading prebuilt ${getSelectedGameLabel(selected)} map ${selected.mapId}...`
    );

    const rawScene = await fetchJson(getStaticSceneUrl(selected));
    const scene = await materializeScene(selected, rawScene);
    if (token !== state.buildToken) {
      return;
    }

    setLoadingState(true, { phase: "loading-static-atlases" });
    setStatus(`Loading ${scene.atlases.length} prebuilt atlas image${scene.atlases.length === 1 ? "" : "s"} for ${getSelectedGameLabel(selected)} map ${selected.mapId}...`);
    const atlasImages = await loadSceneAssets(scene, selected, null);
    if (token !== state.buildToken) {
      return;
    }

    applyLoadedScene(selected, null, scene, atlasImages, preservedView);
    setLoadingState(false);
    setStatus(`Ready. ${getSelectedGameLabel(selected)} map ${selected.mapId} prebuilt static scene loaded.`);
  }

  async function startBuild(selected) {
    clearTimeout(state.buildPollTimer);
    const token = ++state.buildToken;
    rememberViewport();
    const preservedView = resolveViewportForSelection(selected);

    hideOverlayTooltip();
    hideInspectHighlight();
    setEmptyStateVisible(false);

    if (!state.current) {
      enableZoomControls(false);
      setMeta(null);
      setDownloadState(false);
      setMapBinaryDownloadState(false);
      setHiddenExportState(false);
      setReloadState(false);
    }

    if (isStaticMode()) {
      await loadStaticScene(selected, token, preservedView);
      return;
    }

    setLoadingState(true, { phase: "queued" });
    setStatus(
      preservedView
        ? `Rebuilding ${getSelectedGameLabel(selected)} map ${selected.mapId}. The current camera stays in place until the new scene is ready.`
        : `Building ${getSelectedGameLabel(selected)} map ${selected.mapId}...`
    );

    const build = await fetchJson(getDynamicBuildsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selected)
    });

    await pollBuild(build.id, selected, token, preservedView);
  }

  async function pollBuild(jobId, selected, token, preservedView) {
    if (token !== state.buildToken) {
      return;
    }
    const build = await fetchJson(getDynamicBuildStatusUrl(jobId));
    if (token !== state.buildToken) {
      return;
    }

    const latest = build.progress.at(-1);
    setLoadingState(build.status !== "ready" && build.status !== "failed", build);
    setStatus(latest ? `${build.phase}: ${latest.message}` : `${build.phase}...`);
    if (build.status === "failed") {
      setLoadingState(false);
      throw new Error(build.error || "Build failed");
    }
    if (build.status !== "ready") {
      state.buildPollTimer = window.setTimeout(() => {
        pollBuild(jobId, selected, token, preservedView).catch((error) => {
          setStatus(error.message);
        });
      }, 1000);
      return;
    }

    const rawScene = await fetchJson(getDynamicSceneUrl(selected, jobId));
    const scene = await materializeScene(selected, rawScene);
    if (token !== state.buildToken) {
      return;
    }

    setStatus(`Loading ${scene.atlases.length} atlas image${scene.atlases.length === 1 ? "" : "s"} for ${getSelectedGameLabel(selected)} map ${selected.mapId}...`);
    const atlasImages = await loadSceneAssets(scene, selected, jobId);
    if (token !== state.buildToken) {
      return;
    }

    applyLoadedScene(selected, jobId, scene, atlasImages, preservedView);
    setLoadingState(false);
    setStatus(`Ready. ${getSelectedGameLabel(selected)} map ${selected.mapId} is atlas-backed and fully loaded.`);
  }

  function scheduleAutoBuild() {
    clearTimeout(autoBuildTimer);
    setEmptyStateVisible(false);
    autoBuildTimer = window.setTimeout(() => {
      const selected = getSelectedMap();
      if (!selected) {
        setEmptyStateVisible(true);
        return;
      }
      if (currentSelectionMatches(selected)) {
        return;
      }
      startBuild(selected).catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    }, 100);
  }

  async function restoreHistorySelection() {
    const historySelection = getHistorySelection(readViewerHistoryState());
    if (!historySelection) {
      return;
    }

    historyRestoreInProgress = true;
    try {
      rememberViewport();
      const selectedVersion = syncVersionSelection(historySelection);
      writeViewerPreferences();
      if (!selectedVersion) {
        return;
      }
      const selected = getSelectedMap();
      if (!selected || currentSelectionMatches(selected)) {
        return;
      }
      await startBuild(selected);
    } finally {
      historyRestoreInProgress = false;
    }
  }

  async function loadCatalog() {
    populateCatalog(await fetchJson(appUrl(getCatalogDataPath(state.siteConfig))), {
      setDownloadState,
      setReloadState,
      setStatus,
      downloadByUrl
    });
  }

  function handleViewportClick(event) {
    if (event.target.closest("#overlay-tooltip") || !state.current) {
      return;
    }
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }

    if (state.eggPlacement) {
      event.preventDefault();
      updateEggPlacementPreview(event.clientX, event.clientY);
      placePendingTeleportEgg();
      return;
    }

    const item = findItemAtPoint(clientToScenePoint(event.clientX, event.clientY));
    if (!inspectShapesCheckbox.checked && !state.pinnedItemId && !isEditorSelectableItem(item) && !isEggItem(item)) {
      return;
    }

    if (!canPinItem(item)) {
      state.pinnedItemId = null;
      state.hoverItemId = null;
    } else {
      state.pinnedItemId = state.pinnedItemId === item.id ? null : item.id;
      state.hoverItemId = state.pinnedItemId ? null : item.id;
    }
    syncOverlayState();
    scheduleRender();
  }

  function releasePointer(event) {
    state.pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (state.pointers.size < 2) {
      state.pinch = null;
    }
    if (state.drag?.pointerId === event.pointerId) {
      state.suppressNextClick = state.drag.moved;
      state.drag = null;
    }
    if (state.pointers.size === 0) {
      viewport.classList.remove("is-dragging");
    }
  }

  function beginPanelResize(event) {
    event.preventDefault();
    state.panelResize = {
      startX: event.clientX,
      startWidth: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--panel-width")) || 360
    };
    panelResizer.classList.add("is-dragging");
  }

  function updatePanelResize(event) {
    if (!state.panelResize) {
      return;
    }
    const nextWidth = Math.max(280, Math.min(window.innerWidth * 0.65, state.panelResize.startWidth + (event.clientX - state.panelResize.startX)));
    document.documentElement.style.setProperty("--panel-width", `${nextWidth}px`);
  }

  function endPanelResize() {
    if (!state.panelResize) {
      return;
    }
    state.panelResize = null;
    panelResizer.classList.remove("is-dragging");
  }

  function handleGlobalKeydown(event) {
    if (event.defaultPrevented) {
      return;
    }

    if (isEggEditOpen() && event.key === "Escape") {
      event.preventDefault();
      closeEggEditModal();
      return;
    }

    if (state.eggPlacement && event.key === "Escape") {
      event.preventDefault();
      cancelEggPlacement();
      setStatus("Teleport egg placement cancelled.");
      return;
    }

    const isPlainF = !event.repeat
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && !event.altKey
      && (event.code === "KeyF" || event.key.toLowerCase() === "f");

    if (isPlainF) {
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      showBoundingBoxesCheckbox.checked = !showBoundingBoxesCheckbox.checked;
      showBoundingBoxesCheckbox.dispatchEvent(new Event("change"));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (!canEditCatalog() || state.catalogEditHistory.length === 0) {
        return;
      }
      event.preventDefault();
      undoLastCatalogEdit().catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    }
  }

  function attachEventHandlers() {
    mapForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = getSelectedMap();
      if (!selected) {
        setStatus("Choose a map first.");
        return;
      }
      try {
        await startBuild(selected);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    mapSelect.addEventListener("change", () => {
      rememberViewport();
      updateMapNavigationState();
      rememberSelection(getSelectedMap());
      writeViewerPreferences();
      scheduleAutoBuild();
    });
    versionSelect.addEventListener("change", () => {
      rememberViewport();
      const previousSelection = getSelectedMap();
      const selectedVersion = syncVersionSelection(previousSelection);
      writeViewerPreferences();
      if (!selectedVersion) {
        setStatus(isStaticMode() ? "No exported versions were found in the static site bundle." : "No usable versioned STATIC folders were detected under the app root.");
        setEmptyStateVisible(true);
        return;
      }
      scheduleAutoBuild();
    });
    window.addEventListener("popstate", () => {
      restoreHistorySelection().catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    });
    mapPrevButton.addEventListener("click", () => stepSelectedMap(-1, () => {
      writeViewerPreferences();
      scheduleAutoBuild();
    }));
    mapNextButton.addEventListener("click", () => stepSelectedMap(1, () => {
      writeViewerPreferences();
      scheduleAutoBuild();
    }));
    includeEditorCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
        scheduleRender();
      }
    });
    showEditorLinkArrowsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      scheduleRender();
    });
    alwaysShowRangesCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      scheduleRender();
    });
    showF7GridCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
      }
      scheduleRender();
    });
    showAltF7SnapRangesCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
      }
      scheduleRender();
    });
    showCtrlF7EggRangesCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
      }
      scheduleRender();
    });
    alwaysShowNpcPreviewsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        scheduleRender();
      }
    });
    alwaysShowItemPreviewsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        scheduleRender();
      }
    });
    includeRoofsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
        scheduleRender();
      }
    });
    includeOobCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
        scheduleRender();
      }
    });
    showBoundingBoxesCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      if (state.current) {
        setMeta(state.current.metadata);
      }
      scheduleRender();
    });
    showLinkArrowsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      scheduleRender();
    });
    inspectShapesCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      setInspectMode(inspectShapesCheckbox.checked);
      scheduleRender();
    });
    showEggLabelsCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      scheduleRender();
    });
    addEggButton.addEventListener("click", () => {
      toggleEggPlacementMode("teleporter");
    });
    addDestinationEggButton.addEventListener("click", () => {
      toggleEggPlacementMode("teleport-destination");
    });
    eggPlacementIdInput.addEventListener("input", () => {
      let warning = "";
      try {
        warning = duplicateTeleportWarning(state.current?.eggs ?? [], normalizeTeleportId(eggPlacementIdInput.value));
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
      setEggPlacementWarning(warning);
      if (state.eggPlacement && state.lastPointerClient) {
        updateEggPlacementPreview(state.lastPointerClient.x, state.lastPointerClient.y);
      }
    });

    for (const { checkbox } of EGG_FILTERS) {
      checkbox.addEventListener("change", () => {
        writeViewerPreferences();
        renderEggList();
        scheduleRender();
      });
    }
    monsterSpawnerFilterBlockedCheckbox.addEventListener("change", () => {
      writeViewerPreferences();
      renderMonsterSpawnerList();
    });

    document.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keydown", handleGlobalKeydown);

    downloadButton.addEventListener("click", async () => {
      if (downloadButton.classList.contains("is-disabled")) {
        return;
      }
      try {
        setStatus("Encoding PNG export in the browser...");
        await downloadCurrentScene();
        setStatus(`Ready. ${getSelectedGameLabel(state.current.selected)} map ${state.current.selected.mapId} export created.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    downloadSceneJsonButton.addEventListener("click", () => {
      if (downloadSceneJsonButton.classList.contains("is-disabled")) {
        return;
      }
      try {
        downloadCurrentSceneJson();
        setStatus(`Ready. ${getSelectedGameLabel(state.current.selected)} map ${state.current.selected.mapId} scene JSON exported.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    downloadMapBinaryButton.addEventListener("click", () => {
      if (downloadMapBinaryButton.classList.contains("is-disabled")) {
        return;
      }
      try {
        downloadCurrentMapBinary();
        setStatus(`Ready. ${getSelectedGameLabel(state.current.selected)} map ${state.current.selected.mapId} binary export created.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    downloadAtlasButton.addEventListener("click", async () => {
      if (downloadAtlasButton.classList.contains("is-disabled")) {
        return;
      }
      try {
        await downloadCurrentAtlases();
        setStatus(`Ready. ${getSelectedGameLabel(state.current.selected)} map ${state.current.selected.mapId} atlas export created.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    hiddenExportButton.addEventListener("click", async () => {
      if (hiddenExportButton.classList.contains("is-disabled")) {
        return;
      }
      try {
        await exportHiddenShapes();
        setStatus(`Ready. ${getSelectedGameLabel(state.current.selected)} map ${state.current.selected.mapId} hidden shape export created.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    reloadMapButton.addEventListener("click", async () => {
      if (reloadMapButton.classList.contains("is-disabled")) {
        return;
      }
      const selected = state.current?.selected ?? getSelectedMap();
      if (!selected) {
        setStatus("Choose a map first.");
        return;
      }
      try {
        await startBuild(selected);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    overlayTooltip.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    overlayTooltip.addEventListener("pointerup", (event) => {
      event.stopPropagation();
    });
    overlayTooltip.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    overlayTooltip.addEventListener("wheel", (event) => {
      event.stopPropagation();
    });
    overlayTooltip.addEventListener("touchmove", (event) => {
      event.stopPropagation();
    });

    zoomInButton.addEventListener("click", () => setZoom(state.zoom * ZOOM_FACTOR));
    zoomOutButton.addEventListener("click", () => setZoom(state.zoom / ZOOM_FACTOR));
    zoomResetButton.addEventListener("click", () => setZoom(1));
    zoomFitButton.addEventListener("click", () => fitMap());

    window.addEventListener("resize", () => {
      clampOffsets();
      scheduleRender();
    });

    viewport.addEventListener(
      "wheel",
      (event) => {
        if (!state.current) {
          return;
        }
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const nextZoom = event.deltaY < 0 ? state.zoom * ZOOM_FACTOR : state.zoom / ZOOM_FACTOR;
        setZoom(nextZoom, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      },
      { passive: false }
    );

    viewport.addEventListener("pointermove", (event) => {
      if (state.drag || state.pointers.size > 0) {
        return;
      }
      updateInspectHover(event);
    });

    viewport.addEventListener("pointerleave", () => {
      state.lastPointerClient = null;
      if (state.eggPlacement) {
        state.eggPlacement = {
          ...state.eggPlacement,
          previewItem: null
        };
        scheduleRender();
        return;
      }
      if (!inspectShapesCheckbox.checked || state.pinnedItemId) {
        return;
      }
      state.hoverItemId = null;
      syncOverlayState();
    });

    viewport.addEventListener("click", handleViewportClick);

    viewport.addEventListener("pointerdown", (event) => {
      if (!state.current) {
        return;
      }
      if (event.target.closest("#overlay-tooltip")) {
        return;
      }
      event.preventDefault();
      state.suppressNextClick = false;
      viewport.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.pointers.size === 1) {
        state.drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: state.offsetX,
          originY: state.offsetY,
          moved: false
        };
        viewport.classList.add("is-dragging");
      }

      if (state.pointers.size === 2) {
        const [first, second] = [...state.pointers.values()];
        state.pinch = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          zoom: state.zoom
        };
        state.drag = null;
      }
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!state.current || !state.pointers.has(event.pointerId)) {
        return;
      }
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (state.pointers.size === 2 && state.pinch) {
        const [first, second] = [...state.pointers.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        if (distance > 0) {
          const rect = viewport.getBoundingClientRect();
          const center = {
            x: (first.x + second.x) / 2 - rect.left,
            y: (first.y + second.y) / 2 - rect.top
          };
          setZoom(state.pinch.zoom * (distance / state.pinch.distance), center);
        }
        return;
      }

      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }

      if (Math.abs(event.clientX - state.drag.startX) > 4 || Math.abs(event.clientY - state.drag.startY) > 4) {
        state.drag.moved = true;
      }
      state.offsetX = state.drag.originX + (event.clientX - state.drag.startX);
      state.offsetY = state.drag.originY + (event.clientY - state.drag.startY);
      clampOffsets();
      rememberViewport();
      scheduleRender();
    });

    viewport.addEventListener("pointerup", releasePointer);
    viewport.addEventListener("pointercancel", releasePointer);
    viewport.addEventListener("lostpointercapture", releasePointer);

    panelResizer.addEventListener("pointerdown", beginPanelResize);
    window.addEventListener("pointermove", updatePanelResize);
    window.addEventListener("pointerup", endPanelResize);
    window.addEventListener("pointercancel", endPanelResize);
  }

  async function bootstrap() {
    const viewerPreferences = readViewerPreferences();
    restoreViewerOptions(viewerPreferences);
    restoreSelectionMemory(viewerPreferences);
    restoreViewMemory(viewerPreferences);
    setInspectMode(inspectShapesCheckbox.checked);
    state.siteConfig = await loadSiteConfig();
    await loadNpcSpawnerData(state.siteConfig);
    applySiteConfig(setReloadState);
    await loadCatalog();
    const historySelection = getHistorySelection(readViewerHistoryState());
    if (historySelection) {
      syncVersionSelection(historySelection);
      writeViewerPreferences();
      scheduleAutoBuild();
      return;
    }
    if (restoreSelectedMap(viewerPreferences)) {
      scheduleAutoBuild();
      return;
    }
    writeViewerPreferences();
  }

  function initialize() {
    enableZoomControls(false);
    setMeta(null);
    setDownloadState(false);
    setSceneJsonDownloadState(false);
    setMapBinaryDownloadState(false);
    setAtlasDownloadState(false, 0);
    setHiddenExportState(false);
    setReloadState(false);
    setLoadingState(false);
    setEmptyStateVisible(true);
    updateMapNavigationState();
    hideOverlayTooltip();
    hideInspectHighlight();
    resizeCanvas();
    setInspectMode(false);
    updateEggPlacementButtonState();
    window.dispatchEvent(new CustomEvent(USECODE_STATE_EVENT, { detail: { game: null, mapId: null } }));
  }

  return {
    attachEventHandlers,
    bootstrap,
    initialize,
    scheduleAutoBuild,
    setInspectMode,
    startBuild,
    toggleHidden
  };
}
