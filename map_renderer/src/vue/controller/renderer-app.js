import {
  mapForm,
  versionSelect,
  mapSelect,
  mapPrevButton,
  mapNextButton,
  includeEditorCheckbox,
  showEditorLinkArrowsCheckbox,
  alwaysShowRangesCheckbox,
  alwaysShowNpcPreviewsCheckbox,
  alwaysShowItemPreviewsCheckbox,
  includeRoofsCheckbox,
  includeOobCheckbox,
  showF7GridCheckbox,
  showAltF7SnapRangesCheckbox,
  showCtrlF7EggRangesCheckbox,
  showBoundingBoxesCheckbox,
  showLinkArrowsCheckbox,
  inspectShapesCheckbox,
  downloadButton,
  downloadSceneJsonButton,
  downloadMapBinaryButton,
  downloadAtlasButton,
  eggSection,
  monsterSpawnerSection,
  showEggLabelsCheckbox,
  eggFilterTeleportDestinationCheckbox,
  eggFilterTeleporterCheckbox,
  eggFilterMonsterCheckbox,
  eggFilterUsecodeCheckbox,
  eggFilterGlobCheckbox,
  monsterSpawnerFilterBlockedCheckbox,
  eggPlacementIdInput,
  eggPlacementWarning,
  addEggButton,
  addDestinationEggButton,
  eggList,
  eggEmpty,
  eggCount,
  monsterSpawnerList,
  monsterSpawnerEmpty,
  monsterSpawnerCount,
  hiddenExportButton,
  hiddenList,
  hiddenEmpty,
  hiddenCount,
  viewport,
  viewportHint,
  canvas,
  overlayTooltip,
  zoomInButton,
  zoomOutButton,
  zoomResetButton,
  zoomFitButton,
  reloadMapButton,
  panelResizer,
  initializeDomElements
} from "./dom-elements.js";
import { state, context, ZOOM_FACTOR, FIT_PADDING, DEVICE_PIXEL_RATIO, EXPORT_BACKGROUND, initializeControllerState } from "./state.js";
import {
  appUrl,
  isStaticMode,
  canEditCatalog,
  escapeHtml,
  decodeCatalogBoolean,
  cloneCatalogSnapshot,
  catalogSnapshotsEqual,
  listChangedCatalogFields,
  formatUndoSummary,
  isTypingTarget,
  loadSiteConfig,
  fetchJson
} from "../../public/helpers.js";
import {
  buildEggMetadataFromDefinition,
  duplicateTeleportWarning,
  nextFreeTeleportEggId,
  normalizeTeleportId,
  sortEggItems
} from "../../public/egg-utils.js";
import {
  closeEggEditModal,
  openEggEditModal,
  isEggEditOpen
} from "../../shared/egg-edit-bridge.js";
import {
  showToast,
  setEmptyStateVisible,
  setStatus,
  setLoadingState,
  setMeta,
  enableZoomControls,
  setDownloadState,
  setSceneJsonDownloadState,
  setMapBinaryDownloadState,
  setAtlasDownloadState,
  setHiddenExportState,
  setReloadState,
  updateZoomLabel
} from "./ui-controls.js";
import { getNpcSpawnerInfo, loadNpcSpawnerData } from "../../public/npc-spawner-data.js";
import {
  getSelectedMap,
  rememberSelection,
  syncVersionSelection,
  updateMapNavigationState,
  stepSelectedMap,
  currentSelectionMatches,
  applySiteConfig,
  populateCatalog,
  getCatalogUpdateUrl
} from "./map-catalog-ui.js";
import {
  getStaticSceneUrl,
  getDynamicBuildsUrl,
  getDynamicBuildStatusUrl,
  getDynamicSceneUrl,
  getAtlasUrl,
  loadSceneAssets
} from "../../public/scene-api.js";
import {
  clearTooltipState,
  registerTooltipPreviewRenderer,
  setTooltipState
} from "../../shared/tooltip-bridge.js";
import { getCatalogDataPath } from "../../shared/runtime-adapter.js";
import {
  describeEggType,
  formatHex,
  formatNumericField,
  formatDiskCoords,
  formatWorldCoords,
  penIconSvg as renderPenIconSvg,
  eyeIconSvg,
  formatEggId
} from "./formatters.js";
import { createCatalogActions } from "./catalog-actions.js";
import { createSceneMetadataHelpers } from "./scene-metadata.js";
import { createScenePresentationController } from "./scene-presentation.js";
import { createSceneRuntimeController } from "./scene-runtime.js";

initializeDomElements();
initializeControllerState();

const EGG_FILTERS = [
  { type: "teleport-destination", checkbox: eggFilterTeleportDestinationCheckbox },
  { type: "teleporter", checkbox: eggFilterTeleporterCheckbox },
  { type: "monster-spawn", checkbox: eggFilterMonsterCheckbox },
  { type: "usecode-trigger", checkbox: eggFilterUsecodeCheckbox },
  { type: "glob", checkbox: eggFilterGlobCheckbox }
];

let startBuild = async () => {};
let toggleHidden = () => {};
let saveCatalogEntry = async () => {};
let undoLastCatalogEdit = async () => {};
let saveTeleportEggId = () => {};
let saveMonsterSpawnerState = () => {};

function cloneMapSource(mapSource) {
  if (!mapSource) {
    return null;
  }
  return {
    ...mapSource,
    items: mapSource.items.map((item) => ({ ...item }))
  };
}

function updateViewportModeHint() {
  viewport.classList.toggle("egg-placement-active", Boolean(state.eggPlacement));
  if (state.eggPlacement) {
    viewportHint.textContent = `${state.eggPlacement.type === "teleport-destination" ? "Teleport destination" : "Teleporter"} placement: move the cursor and click to place. Press Esc or click the active button again to cancel.`;
    return;
  }
  viewportHint.textContent = inspectShapesCheckbox.checked
    ? "Inspect mode: click a shape to pin its tooltip. Drag still pans."
    : "Drag to pan. Scroll or pinch to zoom. Editor objects remain clickable when visible.";
}

function hasTeleportEggPlacementSupport() {
  return Boolean(state.current?.mapSource && getTeleportEggTemplate());
}

function updateEggPlacementButtonState() {
  const enabled = hasTeleportEggPlacementSupport();
  addEggButton.classList.toggle("is-disabled", !enabled);
  addEggButton.classList.toggle("is-active", state.eggPlacement?.type === "teleporter");
  addEggButton.setAttribute("aria-disabled", String(!enabled));
  addEggButton.disabled = !enabled;
  addEggButton.textContent = state.eggPlacement?.type === "teleporter" ? "Cancel Teleporter" : "Add Teleporter";
  addDestinationEggButton.classList.toggle("is-disabled", !enabled);
  addDestinationEggButton.classList.toggle("is-active", state.eggPlacement?.type === "teleport-destination");
  addDestinationEggButton.setAttribute("aria-disabled", String(!enabled));
  addDestinationEggButton.disabled = !enabled;
  addDestinationEggButton.textContent = state.eggPlacement?.type === "teleport-destination" ? "Cancel Destination" : "Add Destination";
}

function roundToEven(value) {
  return Math.round(value / 2) * 2;
}

function getTeleportEggTemplate(type = "teleporter") {
  if (!state.current?.mapSource) {
    return null;
  }
  const shape = state.current.mapSource.defaultTeleportEggShape;
  const frame = type === "teleport-destination"
    ? (state.current.mapSource.defaultTeleportDestinationEggFrame ?? state.current.mapSource.defaultTeleportEggFrame ?? 0)
    : (state.current.mapSource.defaultTeleporterEggFrame ?? state.current.mapSource.defaultTeleportEggFrame ?? 0);
  if (!Number.isInteger(shape) || !Number.isInteger(frame)) {
    return null;
  }
  const shapeDefId = `shape:${shape}`;
  const spriteId = `sprite:${shape}:${frame}`;
  const definition = state.current.shapeDefinitions.get(shapeDefId) ?? null;
  const sprite = state.current.spriteIndex.get(spriteId) ?? null;
  if (!definition || !sprite) {
    return null;
  }
  return { shape, frame, shapeDefId, spriteId, definition, sprite };
}

function projectSyntheticScreenRect(world, sprite, definition, flipped = false) {
  if (!state.current) {
    return null;
  }
  const xdim = ((flipped ? definition.dimensions.y : definition.dimensions.x) ?? 0) * 32;
  const ydim = ((flipped ? definition.dimensions.x : definition.dimensions.y) ?? 0) * 32;
  const minLeft = state.current.metadata.bounds.screenLeft;
  const minTop = state.current.metadata.bounds.screenTop;
  const yFar = world.y - ydim;
  const sxBot = Math.trunc(world.x / 4 - world.y / 4) - minLeft;
  const syBot = Math.trunc(world.x / 8 + world.y / 8 - world.z) - minTop;
  const left = flipped ? sxBot + sprite.xoff - sprite.width : sxBot - sprite.xoff;
  const top = syBot - sprite.yoff;
  return {
    left,
    top,
    right: left + sprite.width,
    bottom: top + sprite.height,
    width: sprite.width,
    height: sprite.height,
    anchorX: Math.trunc(left + sprite.width / 2),
    anchorY: top + sprite.height,
    sxBot,
    syBot,
    yFar,
    xdim,
    ydim
  };
}

function scenePointToWorldPoint(scenePoint, z) {
  const minLeft = state.current?.metadata.bounds.screenLeft ?? 0;
  const minTop = state.current?.metadata.bounds.screenTop ?? 0;
  const sx = scenePoint.x + minLeft;
  const sy = scenePoint.y + minTop + z;
  return {
    x: roundToEven(2 * sx + 4 * sy),
    y: roundToEven(4 * sy - 2 * sx),
    z
  };
}

function nextTeleportEggId() {
  return nextFreeTeleportEggId(state.current?.eggs ?? [], 1);
}

function getItemById(itemId) {
  return state.current?.itemIndex.get(itemId) ?? null;
}

function getShapeDefinition(shapeDefId) {
  return state.current?.shapeDefinitions.get(shapeDefId) ?? null;
}

function getLinkedPreviewDisplay(preview) {
  if (!preview) {
    return null;
  }
  const definition = getShapeDefinition(preview.shapeDefId);
  return {
    ...preview,
    definition,
    displayName: definition?.displayName || preview.shapeHex || preview.shapeDefId,
    description: definition?.description || "",
    shapeHex: definition?.shapeHex || preview.shapeHex || "-"
  };
}

function createSyntheticTeleportEggItem(record, { preview = false } = {}) {
  const template = getTeleportEggTemplate(record.frame === (state.current?.mapSource?.defaultTeleportDestinationEggFrame ?? 1) ? "teleport-destination" : "teleporter");
  if (!template) {
    return null;
  }
  const screen = projectSyntheticScreenRect(record, template.sprite, template.definition, false);
  if (!screen) {
    return null;
  }
  const egg = buildEggMetadataFromDefinition(record, template.definition);
  return {
    id: preview ? "item:preview:teleport-egg" : `item:edit:${state.syntheticItemSerial += 1}`,
    mapSourceIndex: record.mapSourceIndex ?? null,
    drawOrder: state.current.scene.items.length,
    kind: template.definition.kind || "egg",
    label: preview ? "Pending Teleport Egg" : (template.definition.label || "Egg Trigger"),
    source: "fixed",
    world: {
      x: record.x,
      y: record.y,
      z: record.z
    },
    mapNum: record.mapNum,
    npcNum: record.npcNum,
    nextItem: record.nextItem,
    quality: record.quality,
    frame: record.frame,
    screen,
    flags: {
      raw: record.flags,
      hex: formatHex(record.flags, 4),
      invisible: false,
      flipped: false
    },
    presentation: {
      opacity: preview ? 0.76 : 1,
      visibilityDefault: true
    },
    notes: preview ? ["pending-placement", "egg-family"] : ["user-added", "egg-family"],
    frameSize: {
      width: template.sprite.width,
      height: template.sprite.height,
      xoff: template.sprite.xoff,
      yoff: template.sprite.yoff
    },
    egg,
    shapeDefId: template.shapeDefId,
    spriteId: template.spriteId
  };
}

function refreshCurrentDerivedCollections() {
  if (!state.current) {
    return;
  }
  state.current.dataRevision = (state.current.dataRevision ?? 0) + 1;
  state.current.itemIndex = new Map(state.current.scene.items.map((item) => [item.id, item]));
  state.current.eggs = sortEggItems(state.current.scene.items);
  eggSection.open = state.current.eggs.length > 0 || Boolean(state.eggPlacement);
}

function getMapSourceRecordForItem(item) {
  if (!state.current?.mapSource || !Number.isInteger(item?.mapSourceIndex)) {
    return null;
  }
  return state.current.mapSource.items[item.mapSourceIndex] ?? null;
}

function updateTeleportEggWarningElement(element, teleportId, excludeItemId = null) {
  if (!element) {
    return;
  }
  const warning = duplicateTeleportWarning(state.current?.eggs ?? [], teleportId, excludeItemId);
  element.hidden = !warning;
  element.textContent = warning;
}

const {
  buildWarpCommand,
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
  getUsecodeViewTarget
} = createSceneMetadataHelpers({
  state,
  escapeHtml,
  getNpcSpawnerInfo,
  getShapeDefinition,
  getLinkedPreviewDisplay,
  formatNumericField,
  formatWorldCoords
});

const presentation = createScenePresentationController({
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
  saveCatalogEntry: (...args) => saveCatalogEntry(...args),
  saveTeleportEggId: (...args) => saveTeleportEggId(...args),
  saveMonsterSpawnerState: (...args) => saveMonsterSpawnerState(...args),
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
  getShapeDefinition,
  clampOffsets,
  resizeCanvas,
  toggleHidden: (...args) => toggleHidden(...args)
});

const {
  drawSceneToContext,
  drawTooltipPreview,
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
  updateHiddenList,
  updateMonsterSpawnerListSelection,
  updateEggListSelection
} = presentation;

({ saveCatalogEntry, undoLastCatalogEdit } = createCatalogActions({
  state,
  decodeCatalogBoolean,
  cloneCatalogSnapshot,
  catalogSnapshotsEqual,
  listChangedCatalogFields,
  formatUndoSummary,
  fetchJson,
  getCatalogUpdateUrl,
  getShapeDefinition,
  getItemById,
  canEditCatalog,
  startBuild: (...args) => startBuild(...args),
  showToast,
  setStatus
}));

saveTeleportEggId = function saveTeleportEggIdImpl(item, form) {
  if (!state.current || !isEggItem(item) || !["teleporter", "teleport-destination"].includes(item.egg?.type)) {
    return;
  }
  const mapSourceRecord = getMapSourceRecordForItem(item);
  if (!mapSourceRecord) {
    throw new Error("This egg is not backed by an editable FIXED record.");
  }
  const nextId = normalizeTeleportId(form.elements.teleportId?.value);
  const quality = (mapSourceRecord.quality & 0xff00) | (nextId & 0xff);
  mapSourceRecord.quality = quality;
  item.quality = quality;
  item.egg = buildEggMetadataFromDefinition(mapSourceRecord, getShapeDefinition(item.shapeDefId));
  state.current.scene.mapSource = state.current.mapSource;
  refreshCurrentDerivedCollections();
  renderEggList();
  syncOverlayState();
  scheduleRender();
  const warning = duplicateTeleportWarning(state.current?.eggs ?? [], nextId, item.id);
  if (warning) {
    showToast(warning);
    setStatus(warning);
    return;
  }
  setStatus(`Updated ${describeEggType(item.egg)} ${item.id} to teleport ID ${nextId}.`);
};

saveMonsterSpawnerState = function saveMonsterSpawnerStateImpl(item, root, definition = null) {
  if (!state.current || !isMonsterSpawnerItem(item, definition)) {
    return;
  }

  const mapSourceRecord = getMapSourceRecordForItem(item);
  if (!mapSourceRecord) {
    throw new Error("This spawner is not backed by an editable FIXED record.");
  }

  const frameValue = root.querySelector("[data-monster-spawner-frame]")?.value ?? "";
  const nextFrame = Number.parseInt(frameValue, 10);
  if (!Number.isInteger(nextFrame) || nextFrame < 0 || nextFrame > 255) {
    throw new Error("Invalid MONSTER spawner frame value.");
  }

  const enterMode = root.querySelector("[data-monster-spawner-enter-mode]")?.value === "blocked"
    ? "blocked"
    : "auto";
  const nextMapNum = enterMode === "blocked"
    ? ((mapSourceRecord.mapNum | 0x08) & 0xff)
    : ((mapSourceRecord.mapNum & ~0x08) & 0xff);

  mapSourceRecord.frame = nextFrame;
  mapSourceRecord.mapNum = nextMapNum;
  item.frame = nextFrame;
  item.mapNum = nextMapNum;

  const nextSpriteId = `sprite:${definition.shape}:${nextFrame}`;
  const sprite = state.current.spriteIndex.get(nextSpriteId) ?? null;
  item.spriteId = nextSpriteId;
  if (sprite) {
    item.frameSize = {
      width: sprite.width,
      height: sprite.height,
      xoff: sprite.xoff,
      yoff: sprite.yoff
    };
  }

  state.current.scene.mapSource = state.current.mapSource;
  refreshCurrentDerivedCollections();
  renderMonsterSpawnerList();
  setMapBinaryDownloadState(true);
  syncOverlayState();
  scheduleRender();
  setStatus(`Updated ${definition.shapeHex} spawner to frame ${nextFrame} with ${enterMode === "auto" ? "auto-enter enabled" : "auto-enter blocked"}.`);
};

function updateEggPlacementPreview(clientX, clientY) {
  if (!state.current || !state.eggPlacement) {
    return;
  }
  const point = {
    x: (clientX - viewport.getBoundingClientRect().left - state.offsetX) / state.zoom,
    y: (clientY - viewport.getBoundingClientRect().top - state.offsetY) / state.zoom
  };
  const hoveredItem = [...state.current.scene.items].reverse().find((item) => pointHitsItem(point, item)) ?? null;
  const hoveredDefinition = hoveredItem ? getShapeDefinition(hoveredItem.shapeDefId) : null;
  const z = hoveredItem && hoveredDefinition?.dimensions ? hoveredItem.world.z + hoveredDefinition.dimensions.z * 8 : 0;
  const world = scenePointToWorldPoint(point, z);
  const teleportId = getRequestedPlacementTeleportId() ?? nextTeleportEggId();
  const frame = state.eggPlacement.type === "teleport-destination"
    ? (state.current.mapSource.defaultTeleportDestinationEggFrame ?? state.current.mapSource.defaultTeleportEggFrame ?? 1)
    : (state.current.mapSource.defaultTeleporterEggFrame ?? state.current.mapSource.defaultTeleportEggFrame ?? 0);
  const record = {
    x: world.x,
    y: world.y,
    z: world.z,
    shape: state.current.mapSource.defaultTeleportEggShape,
    frame,
    flags: 0,
    quality: teleportId,
    npcNum: 0,
    mapNum: 0,
    nextItem: 0,
    source: "fixed"
  };
  state.eggPlacement = {
    ...state.eggPlacement,
    record,
    previewItem: createSyntheticTeleportEggItem(record, { preview: true })
  };
  scheduleRender();
}

function cancelEggPlacement() {
  if (!state.eggPlacement) {
    return;
  }
  state.eggPlacement = null;
  setEggPlacementWarning("");
  updateEggPlacementButtonState();
  updateViewportModeHint();
  scheduleRender();
}

function bumpMetadataForAddedEgg() {
  if (!state.current) {
    return;
  }
  state.current.metadata.rawItemCount += 1;
  state.current.metadata.itemCount += 1;
  state.current.metadata.paintedItemCount += 1;
  state.current.metadata.baseItemSummary.eggFamilyItems += 1;
  state.current.metadata.sceneSummary.kindCounts.egg = (state.current.metadata.sceneSummary.kindCounts.egg ?? 0) + 1;
}

function placePendingTeleportEgg() {
  if (!state.current?.mapSource || !state.eggPlacement?.record) {
    return;
  }
  const record = {
    ...state.eggPlacement.record,
    mapSourceIndex: state.current.mapSource.items.length
  };
  const item = createSyntheticTeleportEggItem(record);
  if (!item) {
    throw new Error("Teleport egg sprite is not available in the current scene bundle");
  }
  state.current.mapSource.items.push(record);
  state.current.mapSource.itemCount = state.current.mapSource.items.length;
  state.current.mapSource.originalByteLength = state.current.mapSource.items.length * state.current.mapSource.itemRecordSize;
  state.current.scene.mapSource = state.current.mapSource;
  state.current.scene.items.push(item);
  refreshCurrentDerivedCollections();
  bumpMetadataForAddedEgg();
  state.pinnedItemId = item.id;
  state.hoverItemId = null;
  const warning = duplicateTeleportWarning(state.current?.eggs ?? [], item.egg?.labelId, item.id);
  cancelEggPlacement();
  eggPlacementIdInput.value = String(nextTeleportEggId());
  setMeta(state.current.metadata);
  renderEggList();
  setMapBinaryDownloadState(true);
  if (warning) {
    showToast(warning);
    setStatus(warning);
  } else {
    setStatus(`Added ${describeEggType(item.egg)} ${formatEggId(item.egg?.labelId)}.`);
  }
  showToast(`Added ${describeEggType(item.egg)} ${formatEggId(item.egg?.labelId)} at ${item.world.x}, ${item.world.y}, ${item.world.z}.`);
  scheduleRender();
}

function toggleEggPlacementMode(type) {
  if (!hasTeleportEggPlacementSupport()) {
    return;
  }
  if (state.eggPlacement?.type === type) {
    cancelEggPlacement();
    setStatus(`${type === "teleport-destination" ? "Teleport destination" : "Teleporter"} placement cancelled.`);
    return;
  }
  state.pinnedItemId = null;
  state.hoverItemId = null;
  hideInspectHighlight();
  hideOverlayTooltip();
  if (!eggPlacementIdInput.value) {
    eggPlacementIdInput.value = String(nextTeleportEggId());
  }
  state.eggPlacement = { type, record: null, previewItem: null };
  setEggPlacementWarning(duplicateTeleportWarning(state.current?.eggs ?? [], getRequestedPlacementTeleportId()));
  updateEggPlacementButtonState();
  updateViewportModeHint();
  if (state.lastPointerClient) {
    updateEggPlacementPreview(state.lastPointerClient.x, state.lastPointerClient.y);
  }
  setStatus(`${type === "teleport-destination" ? "Teleport destination" : "Teleporter"} placement active. Click the map to place a new egg, or press Esc to cancel.`);
  scheduleRender();
}

function resizeCanvas() {
  const width = Math.max(1, Math.floor(viewport.clientWidth));
  const height = Math.max(1, Math.floor(viewport.clientHeight));
  canvas.width = Math.floor(width * DEVICE_PIXEL_RATIO);
  canvas.height = Math.floor(height * DEVICE_PIXEL_RATIO);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
  context.imageSmoothingEnabled = false;
}

function clampZoom(nextZoom) {
  if (!state.current) {
    return 1;
  }
  const { min, max } = state.current.metadata.zoom;
  return Math.min(max, Math.max(min, nextZoom));
}

function clampOffsets() {
  if (!state.current) {
    return;
  }
  const { width, height } = state.current.metadata.bounds;
  const scaledWidth = width * state.zoom;
  const scaledHeight = height * state.zoom;

  if (scaledWidth <= viewport.clientWidth) {
    state.offsetX = (viewport.clientWidth - scaledWidth) / 2;
  } else {
    state.offsetX = Math.min(0, Math.max(viewport.clientWidth - scaledWidth, state.offsetX));
  }

  if (scaledHeight <= viewport.clientHeight) {
    state.offsetY = (viewport.clientHeight - scaledHeight) / 2;
  } else {
    state.offsetY = Math.min(0, Math.max(viewport.clientHeight - scaledHeight, state.offsetY));
  }
}

function setZoom(nextZoom, anchor = null) {
  if (!state.current) {
    return;
  }
  const clamped = clampZoom(nextZoom);
  if (clamped === state.zoom) {
    updateZoomLabel();
    return;
  }

  const focus = anchor ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
  const worldX = (focus.x - state.offsetX) / state.zoom;
  const worldY = (focus.y - state.offsetY) / state.zoom;

  state.zoom = clamped;
  state.offsetX = focus.x - worldX * state.zoom;
  state.offsetY = focus.y - worldY * state.zoom;
  clampOffsets();
  updateZoomLabel();
  scheduleRender();
}

function fitMap() {
  if (!state.current) {
    return;
  }
  const { width, height } = state.current.metadata.bounds;
  const scaleX = Math.max(0.01, (viewport.clientWidth - FIT_PADDING * 2) / width);
  const scaleY = Math.max(0.01, (viewport.clientHeight - FIT_PADDING * 2) / height);
  state.zoom = clampZoom(Math.min(scaleX, scaleY));
  clampOffsets();
  updateZoomLabel();
  scheduleRender();
}

const runtime = createSceneRuntimeController({
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
  undoLastCatalogEdit: (...args) => undoLastCatalogEdit(...args),
  getItemById,
  getItemDisplay,
  getMonsterSpawnerItems,
  EGG_FILTERS,
  ZOOM_FACTOR
});

startBuild = runtime.startBuild;
toggleHidden = runtime.toggleHidden;

runtime.initialize();
runtime.attachEventHandlers();
registerTooltipPreviewRenderer(drawTooltipPreview);
runtime.bootstrap().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error));
});
