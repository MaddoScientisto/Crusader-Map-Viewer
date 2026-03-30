import {
  mapForm,
  mapSelect,
  mapPrevButton,
  mapNextButton,
  includeEditorCheckbox,
  alwaysShowNpcPreviewsCheckbox,
  alwaysShowItemPreviewsCheckbox,
  includeRoofsCheckbox,
  includeOobCheckbox,
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
  catalogExportButtons,
  catalogEditingHint,
  spinner,
  progressWrap,
  progressFill,
  statusBox,
  metaBox,
  hiddenList,
  hiddenEmpty,
  hiddenCount,
  viewport,
  viewportHint,
  canvas,
  overlayTooltip,
  eggEditModal,
  notificationToast,
  emptyState,
  zoomLabel,
  reloadMapButton,
  zoomInButton,
  zoomOutButton,
  zoomResetButton,
  zoomFitButton,
  panelResizer
} from "./dom-elements.js";
import { state, context, ZOOM_FACTOR, FIT_PADDING, DEVICE_PIXEL_RATIO, EXPORT_BACKGROUND } from "./state.js";
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
  isTeleportLinkEgg,
  nextFreeTeleportEggId,
  normalizeTeleportId,
  sortEggItems
} from "../../public/egg-utils.js";
import {
  closeEggEditModal,
  initEggEditModal,
  openEggEditModal,
  penIconSvg,
  setEggEditModalWarning
} from "./egg-edit-modal.js";
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

let autoBuildTimer = null;
let renderFrame = 0;
const npcPreviewCanvasCache = new Map();
const itemPreviewCanvasCache = new Map();

const EGG_FILTERS = [
  { type: "teleport-destination", checkbox: eggFilterTeleportDestinationCheckbox },
  { type: "teleporter", checkbox: eggFilterTeleporterCheckbox },
  { type: "monster-spawn", checkbox: eggFilterMonsterCheckbox },
  { type: "usecode-trigger", checkbox: eggFilterUsecodeCheckbox },
  { type: "glob", checkbox: eggFilterGlobCheckbox }
];

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

function saveTeleportEggId(item, form) {
  if (!state.current || !isTeleportLinkEgg(item)) {
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
}

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

function saveMonsterSpawnerState(item, root, definition = null) {
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
}

function updateEggPlacementPreview(clientX, clientY) {
  if (!state.current || !state.eggPlacement) {
    return;
  }
  const point = clientToScenePoint(clientX, clientY);
  const hoveredItem = findItemAtPoint(point);
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

function getItemById(itemId) {
  return state.current?.itemIndex.get(itemId) ?? null;
}

function getShapeDefinition(shapeDefId) {
  return state.current?.shapeDefinitions.get(shapeDefId) ?? null;
}

function getBoundingGeometry(item) {
  const definition = getShapeDefinition(item.shapeDefId);
  return projectBoundingBoxWireframe(item, definition);
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

function isEggItem(item) {
  return Boolean(item?.egg);
}

function formatHex(value, width = 2) {
  return `0x${Number(value).toString(16).padStart(width, "0")}`;
}

function formatEggId(value) {
  if (!Number.isInteger(value)) {
    return "-";
  }
  return `${value} (${formatHex(value, value > 0xff ? 4 : 2)})`;
}

function formatWorldCoords(item) {
  return `${item.world.x}, ${item.world.y}, ${item.world.z}`;
}

function formatDiskCoords(item) {
  return `${Math.trunc(item.world.x / 2)}, ${Math.trunc(item.world.y / 2)}, ${item.world.z}`;
}

function formatNumericField(value) {
  return Number.isInteger(value) ? String(value) : "-";
}

const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const CHEST_ITEM_SPAWNER_SHAPE = 0x0476;
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const MONSTER_SPAWNER_SHAPE = 0x04d0;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;

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

function renderMonsterSpawnerEditor(item, definition = null) {
  if (!isMonsterSpawnerItem(item, definition) || !getMapSourceRecordForItem(item)) {
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

function describeEggType(egg) {
  switch (egg?.type) {
    case "teleporter":
      return "Teleporter";
    case "teleport-destination":
      return "Teleport Destination";
    case "monster-spawn":
      return "Monster Spawn";
    case "usecode-trigger":
      return "Usecode Trigger";
    case "glob":
      return "Glob Egg";
    default:
      return "Egg";
  }
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

function centerViewportOnScenePoint(sceneX, sceneY) {
  state.offsetX = viewport.clientWidth / 2 - sceneX * state.zoom;
  state.offsetY = viewport.clientHeight / 2 - sceneY * state.zoom;
  clampOffsets();
}

function centerViewportOnItem(item) {
  centerViewportOnScenePoint(item.screen.anchorX, item.screen.anchorY);
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
      <div class="egg-item-meta">world ${escapeHtml(`${item.world.x}, ${item.world.y}, ${item.world.z}`)} · shape ${escapeHtml(display.shapeHex)}</div>
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

function eyeIconSvg(hidden) {
  if (hidden) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3.4 5.2C4.8 3.8 6.4 3 8 3c2.8 0 5.3 2.1 6.7 5-0.6 1.2-1.3 2.2-2.2 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6.1a2.4 2.4 0 013.1 3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M1.3 8c0.7-1.3 1.6-2.4 2.6-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.3 8C2.8 5.1 5.2 3 8 3s5.3 2.1 6.7 5c-1.5 2.9-3.9 5-6.7 5S2.8 10.9 1.3 8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/></svg>';
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
  const catalogEntry = display.definition?.catalogEntry ?? null;
  const showCatalogEditor = canEditCatalog() && isPinnedTooltip && display.definition;
  const showTeleportEggEditor = isPinnedTooltip && isTeleportLinkEgg(item);
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
    <dt>World</dt><dd>${escapeHtml(`${item.world.x}, ${item.world.y}, ${item.world.z}`)}</dd>
    <dt>Disk</dt><dd>${escapeHtml(`${Math.trunc(item.world.x / 2)}, ${Math.trunc(item.world.y / 2)}, ${item.world.z}`)}</dd>
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
    warpCommand: isPinnedTooltip ? warpCommand : "",
    catalogEntry,
    eyeIconSvg: eyeIconSvg(hidden),
    penIconSvg: penIconSvg(),
    onToggleHidden: () => {
      toggleHidden(item.id);
    },
    onSaveCatalog: async (payload) => {
      await saveCatalogEntry(item, payload);
    },
    onEditEgg: () => {
      openEggEditModal(item, duplicateTeleportWarning(state.current?.eggs ?? [], item.egg?.labelId, item.id));
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

async function saveCatalogEntry(item, payload) {
  if (!state.current) {
    return;
  }
  const definition = getShapeDefinition(item.shapeDefId);
  if (!definition) {
    throw new Error("No shape definition is available for this item");
  }
  const previousSnapshot = cloneCatalogSnapshot(definition.catalogEntry);

  const normalizedPayload = {
    humanReadableId: String(payload?.humanReadableId ?? "").trim(),
    description: String(payload?.description ?? "").trim(),
    roof: decodeCatalogBoolean(String(payload?.roof ?? "")),
    semitransparency: decodeCatalogBoolean(String(payload?.semitransparency ?? "")),
    oob: decodeCatalogBoolean(String(payload?.oob ?? ""))
  };
  if (catalogSnapshotsEqual(previousSnapshot, normalizedPayload)) {
    setStatus(`No catalog changes to save for ${definition.shapeHex}.`);
    return;
  }

  setStatus(`Saving ${definition.shapeHex} to the ${state.current.selected.game} catalog...`);
  const result = await fetchJson(getCatalogUpdateUrl(state.current.selected.game, definition.shape), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizedPayload)
  });
  state.catalogEditHistory.push({
    game: state.current.selected.game,
    shape: definition.shape,
    shapeHex: definition.shapeHex,
    label: result.entry?.humanReadableId || previousSnapshot.humanReadableId || definition.shapeHex,
    before: previousSnapshot,
    after: cloneCatalogSnapshot(result.entry ?? normalizedPayload)
  });
  state.pendingPinnedItemId = item.id;
  await startBuild(state.current.selected);
  const savedLabel = result.entry?.humanReadableId || definition.displayName || definition.shapeHex;
  showToast(`Saved catalog entry for ${savedLabel}.`);
}

async function undoLastCatalogEdit() {
  if (!canEditCatalog() || state.undoInFlight || state.catalogEditHistory.length === 0) {
    return;
  }

  const entry = state.catalogEditHistory.at(-1);
  state.undoInFlight = true;
  try {
    setStatus(`Undoing last catalog edit for ${entry.shapeHex}...`);
    await fetchJson(getCatalogUpdateUrl(entry.game, entry.shape), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.before)
    });
    state.catalogEditHistory.pop();

    if (state.current?.selected?.game === entry.game) {
      const pinnedItem = state.pinnedItemId ? getItemById(state.pinnedItemId) : null;
      const pinnedDefinition = pinnedItem ? getShapeDefinition(pinnedItem.shapeDefId) : null;
      if (pinnedDefinition?.shape === entry.shape && state.pinnedItemId) {
        state.pendingPinnedItemId = state.pinnedItemId;
      }
      await startBuild(state.current.selected);
    }

    const undoneFields = formatUndoSummary(listChangedCatalogFields(entry.before, entry.after));
    const label = entry.label && entry.label !== entry.shapeHex ? `${entry.shapeHex} ${entry.label}` : entry.shapeHex;
    showToast(`Undid catalog edit for ${label}: restored ${undoneFields}.`);
    setStatus(`Undid catalog edit for ${label}.`);
  } finally {
    state.undoInFlight = false;
  }
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
    button.addEventListener("click", () => toggleHidden(item.id, false));
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
  return isItemVisible(item) || isEggItem(item);
}

function getTeleportArrowLinks() {
  if (!state.current) {
    return [];
  }

  const teleportersById = new Map();
  const destinationsById = new Map();
  for (const item of state.current.eggs) {
    if (!isDrawableLinkItem(item) || !Number.isInteger(item.egg?.labelId)) {
      continue;
    }
    const bucket = item.egg.type === "teleporter"
      ? teleportersById
      : item.egg.type === "teleport-destination"
        ? destinationsById
        : null;
    if (!bucket) {
      continue;
    }
    const existing = bucket.get(item.egg.labelId) ?? [];
    existing.push(item);
    bucket.set(item.egg.labelId, existing);
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
      color: "rgba(92, 181, 255, 0.94)",
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
  if (!state.current || !showLinkArrowsCheckbox.checked) {
    return;
  }

  const links = [
    ...getTeleportArrowLinks(),
    ...getFocusedMonsterSpawnerArrowLinks()
  ];
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
  if (!dimensions || !state.current) {
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
  resizeCanvas();
  context.clearRect(0, 0, viewport.clientWidth, viewport.clientHeight);
  drawSceneToContext(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
  if (state.eggPlacement?.previewItem) {
    drawSceneItemSprite(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.eggPlacement.previewItem, 0.78);
  }
  drawNpcPreviewOverlay(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
  drawItemPreviewOverlay(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
  drawLinkArrows(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY);
  drawBoundingBoxes(context, viewport.clientWidth, viewport.clientHeight, state.zoom, state.offsetX, state.offsetY, state.current?.hiddenIds ?? new Set());
  drawEggLabels(context, viewport.clientWidth, viewport.clientHeight);
  syncOverlayState();
  drawHighlightOverlay(context, state.zoom, state.offsetX, state.offsetY, timestamp);
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
    if (!isItemVisible(item)) {
      continue;
    }
    const geometry = getBoundingGeometry(item);
    const bounds = geometry?.bounds ?? item.screen;
    if (
      point.x >= bounds.left &&
      point.x < bounds.right &&
      point.y >= bounds.top &&
      point.y < bounds.bottom
    ) {
      if (geometry && !pointInPolygon(point, geometry.hitPolygon)) {
        continue;
      }
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
    includeEditor: includeEditorCheckbox.checked,
    includeRoofs: includeRoofsCheckbox.checked,
    includeOob: includeOobCheckbox.checked,
    exportedAt: new Date().toISOString(),
    hiddenShapes: [...grouped.values()].sort((left, right) => left.shapeHex.localeCompare(right.shapeHex))
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

function applyLoadedScene(selected, jobId, scene, atlasImages, preserveView) {
  const editableMapSource = cloneMapSource(scene.mapSource);
  scene.mapSource = editableMapSource;
  npcPreviewCanvasCache.clear();
  itemPreviewCanvasCache.clear();
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
    hiddenIds: new Set()
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

  if (!preserveView) {
    fitMap();
  } else {
    clampOffsets();
    scheduleRender();
  }
}

async function loadStaticScene(selected, token, preserveView) {
  setLoadingState(true, { phase: "loading-static-scene" });
  setStatus(
    preserveView
      ? `Reloading prebuilt ${selected.game} map ${selected.mapId}. The current camera stays in place until the new scene is ready.`
      : `Loading prebuilt ${selected.game} map ${selected.mapId}...`
  );

  const scene = await fetchJson(getStaticSceneUrl(selected));
  if (token !== state.buildToken) {
    return;
  }

  setLoadingState(true, { phase: "loading-static-atlases" });
  setStatus(`Loading ${scene.atlases.length} prebuilt atlas image${scene.atlases.length === 1 ? "" : "s"} for ${selected.game} map ${selected.mapId}...`);
  const atlasImages = await loadSceneAssets(scene, selected, null);
  if (token !== state.buildToken) {
    return;
  }

  applyLoadedScene(selected, null, scene, atlasImages, preserveView);
  setLoadingState(false);
  setStatus(`Ready. ${selected.game} map ${selected.mapId} prebuilt static scene loaded.`);
}

async function startBuild(selected) {
  clearTimeout(state.buildPollTimer);
  const token = ++state.buildToken;
  const preserveView = currentSelectionMatches(selected);

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
    await loadStaticScene(selected, token, preserveView);
    return;
  }

  setLoadingState(true, { phase: "queued" });
  setStatus(
    preserveView
      ? `Rebuilding ${selected.game} map ${selected.mapId}. The current camera stays in place until the new scene is ready.`
      : `Building ${selected.game} map ${selected.mapId}...`
  );

  const build = await fetchJson(getDynamicBuildsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selected)
  });

  await pollBuild(build.id, selected, token, preserveView);
}

async function pollBuild(jobId, selected, token, preserveView) {
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
      pollBuild(jobId, selected, token, preserveView).catch((error) => {
        setStatus(error.message);
      });
    }, 1000);
    return;
  }

  const scene = await fetchJson(getDynamicSceneUrl(selected, jobId));
  if (token !== state.buildToken) {
    return;
  }

  setStatus(`Loading ${scene.atlases.length} atlas image${scene.atlases.length === 1 ? "" : "s"} for ${selected.game} map ${selected.mapId}...`);
  const atlasImages = await loadSceneAssets(scene, selected, jobId);
  if (token !== state.buildToken) {
    return;
  }

  applyLoadedScene(selected, jobId, scene, atlasImages, preserveView);
  setLoadingState(false);
  setStatus(`Ready. ${selected.game} map ${selected.mapId} is atlas-backed and fully loaded.`);
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
  updateMapNavigationState();
  scheduleAutoBuild();
});
mapPrevButton.addEventListener("click", () => stepSelectedMap(-1, scheduleAutoBuild));
mapNextButton.addEventListener("click", () => stepSelectedMap(1, scheduleAutoBuild));
includeEditorCheckbox.addEventListener("change", () => {
  if (state.current) {
    setMeta(state.current.metadata);
    scheduleRender();
  }
});
alwaysShowNpcPreviewsCheckbox.addEventListener("change", () => {
  if (state.current) {
    scheduleRender();
  }
});
alwaysShowItemPreviewsCheckbox.addEventListener("change", () => {
  if (state.current) {
    scheduleRender();
  }
});
includeRoofsCheckbox.addEventListener("change", () => {
  if (state.current) {
    setMeta(state.current.metadata);
    scheduleRender();
  }
});
includeOobCheckbox.addEventListener("change", () => {
  if (state.current) {
    setMeta(state.current.metadata);
    scheduleRender();
  }
});
showBoundingBoxesCheckbox.addEventListener("change", () => {
  if (state.current) {
    setMeta(state.current.metadata);
  }
  scheduleRender();
});
showLinkArrowsCheckbox.addEventListener("change", () => {
  scheduleRender();
});
inspectShapesCheckbox.addEventListener("change", () => {
  setInspectMode(inspectShapesCheckbox.checked);
  scheduleRender();
});
showEggLabelsCheckbox.addEventListener("change", () => {
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

initEggEditModal({
  onSubmit: (event) => {
    event.preventDefault();
    event.stopPropagation();
    const item = getItemById(event.currentTarget.dataset.itemId);
    if (!item) {
      closeEggEditModal();
      return;
    }
    try {
      saveTeleportEggId(item, event.currentTarget);
      closeEggEditModal();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  },
  onInput: (event) => {
    try {
      setEggEditModalWarning(duplicateTeleportWarning(state.current?.eggs ?? [], normalizeTeleportId(event.currentTarget.value), event.currentTarget.form?.dataset.itemId || null));
    } catch (error) {
      setEggEditModalWarning(error instanceof Error ? error.message : String(error));
    }
  },
  onClose: () => {
    closeEggEditModal();
  }
});
for (const { checkbox } of EGG_FILTERS) {
  checkbox.addEventListener("change", () => {
    renderEggList();
    scheduleRender();
  });
}
monsterSpawnerFilterBlockedCheckbox.addEventListener("change", () => {
  renderMonsterSpawnerList();
});

function handleGlobalKeydown(event) {
  if (event.defaultPrevented) {
    return;
  }

  if (!eggEditModal.hidden && event.key === "Escape") {
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

document.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("keydown", handleGlobalKeydown);

downloadButton.addEventListener("click", async () => {
  if (downloadButton.classList.contains("is-disabled")) {
    return;
  }
  try {
    setStatus("Encoding PNG export in the browser...");
    await downloadCurrentScene();
    setStatus(`Ready. ${state.current.selected.game} map ${state.current.selected.mapId} export created.`);
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
    setStatus(`Ready. ${state.current.selected.game} map ${state.current.selected.mapId} scene JSON exported.`);
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
    setStatus(`Ready. ${state.current.selected.game} map ${state.current.selected.mapId} binary export created.`);
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
    setStatus(`Ready. ${state.current.selected.game} map ${state.current.selected.mapId} atlas export created.`);
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
    setStatus(`Ready. ${state.current.selected.game} map ${state.current.selected.mapId} hidden shape export created.`);
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
  scheduleRender();
});

viewport.addEventListener("pointerup", releasePointer);
viewport.addEventListener("pointercancel", releasePointer);
viewport.addEventListener("lostpointercapture", releasePointer);

panelResizer.addEventListener("pointerdown", beginPanelResize);
window.addEventListener("pointermove", updatePanelResize);
window.addEventListener("pointerup", endPanelResize);
window.addEventListener("pointercancel", endPanelResize);

async function bootstrap() {
  state.siteConfig = await loadSiteConfig();
  await loadNpcSpawnerData(state.siteConfig);
  applySiteConfig(setReloadState);
  await loadCatalog();
}

enableZoomControls(false);
updateZoomLabel();
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
registerTooltipPreviewRenderer(drawTooltipPreview);
bootstrap().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error));
});