import { loadImage } from "../../public/scene-api.js";
import { appUrl, fetchJson } from "../../public/helpers.js";
import { getReferenceAtlasPath, getReferenceDataPath } from "../../shared/runtime-adapter.js";
import { GLOB_COORD_BLOCK_SIZE, GLOB_COORD_MASK, getGlobOriginDelta, quantizeGlobAxisDelta, translateGlobChildPosition } from "../../shared/glob-coordinate.js";
import { clearMapEditorSelectionState } from "./map-editor-selection.js";
import { sortMapEditorSceneItems } from "./map-editor-scene.js";
import {
  isEditorEditableItem,
  isEditorSelectableGlobItem,
  isEditorSelectableItem,
  getFixedMapSourceItem,
  getGizmoAxisWorldDelta,
  getSelectionGizmoCenter,
  hitTestGizmoAxis,
  isEditorMapSourceSupported,
  isItemInEditorLayer,
  mapWorldToScenePoint,
  scenePointToMapWorld,
  snapGlobPlacementPosition,
  snapMapPosition
} from "./map-editor-geometry.js";

const MAX_HISTORY = 100;
const MAX_MAP_COORDINATE = 0x1fffe;
const GLOB_PICKER_MIN_TILE_WIDTH = 145;
const GLOB_PICKER_ROW_STRIDE = 151;
const GLOB_PICKER_OVERSCAN = 2;

function cloneMapRecord(record) {
  return { ...record };
}

function cloneSceneItem(item) {
  return structuredClone(item);
}

function recordPosition(record) {
  return { x: record.x, y: record.y, z: record.z };
}

function positionsEqual(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export function createMapEditorController(deps) {
  const {
    state,
    viewport,
    editModeButton,
    mapEditStatus,
    editUndoButton,
    editRedoButton,
    editDeleteButton,
    mapEditorToolbar,
    shapeAddButton,
    editorCurrentLayerSelect,
    editorGlobOutlinesCheckbox,
    editorOnlyShowCurrentLayerCheckbox,
    editorGridSnapCheckbox,
    editorGridSizeSelect,
    editorFloorGridCheckbox,
    editorSelectionCount,
    shapePickerModal,
    shapePickerCloseButton,
    shapePickerSearch,
    shapePickerCount,
    shapePickerList,
    setViewportModeHint,
    setStatus,
    refreshCurrentDerivedCollections,
    resetRenderCaches,
    scheduleRender,
    setMeta,
    setMapBinaryDownloadState,
    clampViewport,
    getShapeDefinition,
    findItemAtPoint,
    makeMapSceneItem,
    reprojectMapSceneItem
  } = deps;
  let shapePreviewObserver = null;
  let globPreviewObserver = null;
  let shapePickerView = "details";
  let pickerType = "shape";
  let globRows = [];
  let globPickerData = null;
  let globAssetIndexes = null;
  let globPickerGrid = null;
  let globPickerTopSpacer = null;
  let globPickerBottomSpacer = null;
  let globPickerKey = null;
  let renderedGlobWindowKey = null;
  const globPickerButtons = new Map();
  const globAtlasImages = new Map();
  const shapePickerTitle = shapePickerModal.querySelector("#shape-picker-title");
  const shapePickerSearchLabel = shapePickerModal.querySelector("#shape-picker-search-label");
  const shapePickerViewModes = shapePickerModal.querySelector(".shape-picker-view-modes");
  const shapePickerDetailsButton = shapePickerModal.querySelector("#shape-picker-details-button");
  const shapePickerAtlasButton = shapePickerModal.querySelector("#shape-picker-atlas-button");

  function isSupportedMap() {
    return isEditorMapSourceSupported(state.current?.mapSource);
  }

  function getSelectedSourceItems() {
    if (!state.current) {
      return [];
    }
    return state.current.scene.items.filter((item) => (
      state.editor.selectedIds.has(item.id)
      && isEditorEditableItem(item)
      && Number.isInteger(item.mapSourceIndex)
      && state.current.mapSource.items[item.mapSourceIndex]
    ));
  }

  function getSelectedGlobChildren() {
    const selection = state.editor.globSelection;
    if (!state.current || !selection) {
      return [];
    }
    return state.current.scene.items.filter((item) => (
      item.source === "glob"
      && item.globParentMapSourceIndex === selection.parentMapSourceIndex
      && item.globIndex === selection.globIndex
    ));
  }

  function getSelectedGlobParentItems() {
    const selection = state.editor.globSelection;
    if (!state.current || !selection) {
      return [];
    }
    return state.current.scene.items.filter((item) => (
      item.source === "fixed"
      && item.mapSourceIndex === selection.parentMapSourceIndex
      && item.quality === selection.globIndex
      && item.egg?.type === "glob"
      && state.current.mapSource.items[item.mapSourceIndex]
    ));
  }

  function getGizmoSelectionItems() {
    return state.editor.currentLayer === "glob" && state.editor.globSelection
      ? getSelectedGlobChildren()
      : getSelectedSourceItems();
  }

  function getGizmoSourceItems() {
    return state.editor.currentLayer === "glob" && state.editor.globSelection
      ? getSelectedGlobParentItems()
      : getSelectedSourceItems();
  }

  function updateUi() {
    const hasMap = Boolean(state.current);
    const supported = isSupportedMap();
    const editableSelectionCount = getSelectedSourceItems().length;
    if (!supported && state.editor.mode) {
      state.editor.mode = false;
      state.editor.placement = null;
      state.editor.drag = null;
      state.editor.hoverAxis = null;
      state.editor.selectedIds.clear();
      state.editor.globSelection = null;
      state.editor.globHover = null;
      shapePickerModal.hidden = true;
    }

    editModeButton.disabled = !supported;
    editModeButton.setAttribute("aria-disabled", String(!supported));
    editModeButton.setAttribute("aria-pressed", String(state.editor.mode));
    editModeButton.classList.toggle("is-disabled", !supported);
    editModeButton.classList.toggle("is-active", state.editor.mode);
    editModeButton.textContent = state.editor.mode ? "Disable Edit Mode" : "Enable Edit Mode";
    editModeButton.title = supported
      ? "Toggle map editing"
      : "Map editing requires a supported FIXED map";

    mapEditorToolbar.hidden = !state.editor.mode;
    shapeAddButton.disabled = !state.editor.mode || Boolean(state.editor.placement);
    shapeAddButton.setAttribute("aria-disabled", String(shapeAddButton.disabled));
    shapeAddButton.title = state.editor.currentLayer === "glob" ? "Add a glob" : "Add a shape";
    editorCurrentLayerSelect.value = state.editor.currentLayer;
    editorCurrentLayerSelect.disabled = !state.editor.mode || Boolean(state.editor.placement);
    editorOnlyShowCurrentLayerCheckbox.checked = state.editor.onlyShowCurrentLayer;
    editorGridSnapCheckbox.checked = state.editor.snapEnabled;
    editorGridSizeSelect.value = String(state.editor.snapSize);
    editorGridSizeSelect.disabled = !state.editor.mode || !state.editor.snapEnabled;
    editorFloorGridCheckbox.checked = state.editor.floorGridEnabled;
    const showGlobOutlineToggle = state.editor.mode && state.editor.currentLayer === "glob";
    editorGlobOutlinesCheckbox.closest("label").hidden = !showGlobOutlineToggle;
    editorGlobOutlinesCheckbox.checked = state.editor.globOutlinesEnabled;
    editorGlobOutlinesCheckbox.disabled = !showGlobOutlineToggle;
    editorSelectionCount.textContent = `${state.editor.selectedIds.size} selected`;
    if (state.editor.globSelection) {
      const { globIndex } = state.editor.globSelection;
      editorSelectionCount.textContent = `Glob 0x${globIndex.toString(16).padStart(4, "0")} · ${getSelectedGlobChildren().length} children`;
    }
    editUndoButton.disabled = !state.editor.mode || state.editor.history.length === 0;
    editRedoButton.disabled = !state.editor.mode || state.editor.future.length === 0;
    editDeleteButton.disabled = !state.editor.mode || editableSelectionCount === 0;
    mapEditStatus.classList.toggle("is-dirty", state.editor.dirty);
    mapEditStatus.textContent = state.editor.dirty
      ? "Unsaved map edits. Download Map Binary to save the edited payload."
      : !hasMap
        ? "Choose a map to begin."
        : !supported
          ? "Editing is available for supported FIXED maps."
          : state.editor.mode
            ? "Edit Mode is active."
            : "No unsaved map edits";
    viewport.classList.toggle("edit-mode-active", state.editor.mode);
    viewport.classList.toggle("shape-placement-active", Boolean(state.editor.placement));
    setViewportModeHint();
  }

  function currentSnapshot() {
    return JSON.stringify(state.current?.mapSource?.items ?? []);
  }

  function updateDirtyState() {
    state.editor.dirty = Boolean(state.current && currentSnapshot() !== state.editor.savedSnapshot);
    updateUi();
  }

  function markSaved() {
    if (!state.current) {
      return;
    }
    state.editor.savedSnapshot = currentSnapshot();
    updateDirtyState();
  }

  function resetForScene() {
    clearMapEditorSelectionState(state);
    state.editor.history = [];
    state.editor.future = [];
    state.editor.dirty = false;
    state.editor.drag = null;
    state.editor.placement = null;
    state.editor.shapeRows = [];
    state.editor.savedSnapshot = currentSnapshot();
    shapePickerModal.hidden = true;
    updateUi();
  }

  function setMode(active) {
    if (active && !isSupportedMap()) {
      setStatus("Map editing is available only for supported FIXED maps.");
      updateUi();
      return;
    }
    state.editor.mode = Boolean(active);
    if (state.editor.mode) {
      state.editor.currentLayer = "fixed";
    }
    state.editor.drag = null;
    state.editor.placement = null;
    shapePickerModal.hidden = true;
    clearMapEditorSelectionState(state);
    updateUi();
    scheduleRender();
    setStatus(state.editor.mode ? "Edit Mode enabled." : "Edit Mode disabled.");
  }

  function setCurrentLayer(layer) {
    if (!isItemInEditorLayer({ source: layer }, layer) || state.editor.currentLayer === layer) {
      return;
    }
    state.editor.currentLayer = layer;
    clearMapEditorSelectionState(state);
    updateUi();
    scheduleRender();
  }

  function selectItem(item, event) {
    if (!state.editor.mode) {
      return;
    }
    if (state.editor.currentLayer === "glob") {
      if (!isEditorSelectableGlobItem(item)) {
        if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
          state.editor.globSelection = null;
        }
      } else {
        state.editor.globSelection = {
          parentMapSourceIndex: item.globParentMapSourceIndex,
          globIndex: item.globIndex
        };
        state.editor.globHover = state.editor.globSelection;
      }
      state.pinnedItemId = null;
      state.hoverItemId = null;
      state.editor.selectedIds.clear();
      state.editor.hoverAxis = null;
      updateUi();
      scheduleRender();
      return;
    }
    state.editor.globSelection = null;
    state.editor.globHover = null;
    if (!isEditorSelectableItem(item) || !isItemInEditorLayer(item, state.editor.currentLayer)) {
      if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
        state.editor.selectedIds.clear();
      }
    } else if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      if (state.editor.selectedIds.has(item.id)) {
        state.editor.selectedIds.delete(item.id);
      } else {
        state.editor.selectedIds.add(item.id);
      }
    } else {
      state.editor.selectedIds = new Set([item.id]);
    }
    state.pinnedItemId = state.editor.selectedIds.has(item?.id)
      ? item.id
      : getSelectedSourceItems()[0]?.id ?? null;
    state.hoverItemId = null;
    state.editor.hoverAxis = null;
    updateUi();
    scheduleRender();
  }

  function clearSelection() {
    if (!state.editor.mode || (state.editor.selectedIds.size === 0 && !state.editor.globSelection)) {
      return;
    }
    state.editor.selectedIds.clear();
    state.editor.globSelection = null;
    state.editor.globHover = null;
    state.pinnedItemId = null;
    state.hoverItemId = null;
    updateUi();
    scheduleRender();
  }

  function getGizmoAxisAtPoint(point) {
    const editableSelectionIds = new Set(getGizmoSelectionItems().map((item) => item.id));
    const center = getSelectionGizmoCenter(
      state.current?.scene.items ?? [],
      editableSelectionIds,
      state.zoom,
      state.offsetX,
      state.offsetY
    );
    return center ? hitTestGizmoAxis(point, center) : null;
  }

  function beginGizmoDrag(axis, pointerId, clientX, clientY) {
    const sourceItems = getGizmoSourceItems();
    const entries = sourceItems.map((item) => ({
      index: item.mapSourceIndex,
      item,
      before: recordPosition(state.current.mapSource.items[item.mapSourceIndex])
    }));
    if (!entries.length) {
      return false;
    }
    state.editor.drag = {
      axis,
      pointerId,
      clientX,
      clientY,
      entries,
      changed: false,
      globSelection: state.editor.currentLayer === "glob" && state.editor.globSelection
        ? { ...state.editor.globSelection }
        : null
    };
    state.editor.drag.entries = entries.map(({ index, item, before }) => ({ index, item, before }));
    return true;
  }

  function applyRecordPosition(index, nextPosition, parentItem = null) {
    const record = state.current.mapSource.items[index];
    if (!record) {
      return false;
    }
    const before = recordPosition(record);
    const after = { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z };
    if (positionsEqual(before, after)) {
      return false;
    }

    const globDelta = getGlobOriginDelta(before, after);
    Object.assign(record, after);
    const sceneParentItem = parentItem ?? getFixedMapSourceItem(state.current.scene.items, index);
    if (sceneParentItem) {
      reprojectMapSceneItem(sceneParentItem, record);
    }
    if (sceneParentItem?.egg?.type === "glob" && (globDelta.x || globDelta.y || globDelta.z)) {
      for (const child of state.current.scene.items) {
        if (
          child.source !== "glob"
          || child.globParentMapSourceIndex !== index
          || child.globIndex !== sceneParentItem.quality
          || !child.world
        ) {
          continue;
        }
        const childPosition = translateGlobChildPosition(child.world, globDelta);
        child.world = childPosition;
        reprojectMapSceneItem(child, { ...childPosition, flags: 0 });
      }
    }
    return true;
  }

  function updateGizmoDrag(clientX, clientY) {
    const drag = state.editor.drag;
    if (!drag || !state.current) {
      return false;
    }
    const globAxisWorldSpan = drag.globSelection && drag.axis !== "z"
      ? GLOB_COORD_BLOCK_SIZE * state.zoom
      : null;
    let delta = getGizmoAxisWorldDelta(
      drag.axis,
      clientX - drag.clientX,
      clientY - drag.clientY,
      state.zoom,
      globAxisWorldSpan
    );
    if (state.editor.snapEnabled) {
      delta = Math.round(delta / state.editor.snapSize) * state.editor.snapSize;
    }
    const coordinate = drag.axis === "x" ? "x" : drag.axis === "y" ? "y" : "z";
    if (drag.globSelection && coordinate !== "z") {
      delta = quantizeGlobAxisDelta(coordinate, delta);
    } else if (coordinate !== "z") {
      delta = Math.round(delta / 2) * 2;
    } else {
      delta = Math.round(delta);
    }
    const maximum = coordinate === "z" ? 0xff : MAX_MAP_COORDINATE;
    const minimumDelta = Math.max(...drag.entries.map((entry) => -entry.before[coordinate]));
    const maximumDelta = Math.min(...drag.entries.map((entry) => maximum - entry.before[coordinate]));
    const lowLimit = drag.globSelection && coordinate !== "z"
      ? Math.ceil(minimumDelta / GLOB_COORD_BLOCK_SIZE) * GLOB_COORD_BLOCK_SIZE
      : minimumDelta;
    const highLimit = drag.globSelection && coordinate !== "z"
      ? Math.floor(maximumDelta / GLOB_COORD_BLOCK_SIZE) * GLOB_COORD_BLOCK_SIZE
      : maximumDelta;
    delta = Math.min(highLimit, Math.max(lowLimit, delta));

    let changed = false;
    for (const entry of drag.entries) {
      const record = state.current.mapSource.items[entry.index];
      const nextPosition = { ...entry.before, [coordinate]: entry.before[coordinate] + delta };
      changed = applyRecordPosition(entry.index, nextPosition, entry.item) || changed;
    }
    drag.changed = drag.changed || changed;
    if (changed) {
      state.current.scene.mapSource = state.current.mapSource;
      resetRenderCaches({ preserveGlobOutlineGroups: Boolean(drag.globSelection) });
      scheduleRender();
    }
    return changed;
  }

  function pushHistory(command) {
    state.editor.history.push(command);
    if (state.editor.history.length > MAX_HISTORY) {
      state.editor.history.shift();
    }
    state.editor.future = [];
    updateDirtyState();
  }

  function finishGizmoDrag() {
    const drag = state.editor.drag;
    state.editor.drag = null;
    if (!drag || !state.current) {
      updateUi();
      return false;
    }
    const changes = drag.entries.map((entry) => ({
      index: entry.index,
      before: entry.before,
      after: recordPosition(state.current.mapSource.items[entry.index])
    })).filter((entry) => !positionsEqual(entry.before, entry.after));
    if (changes.length) {
      resortSceneItemsAndUpdateBounds();
      refreshCurrentDerivedCollections();
      resetRenderCaches();
      pushHistory({ type: "move", axis: drag.axis, changes });
      setMapBinaryDownloadState(true);
      setStatus(drag.globSelection
        ? `Moved glob 0x${drag.globSelection.globIndex.toString(16).padStart(4, "0")}; X/Y movement uses ${GLOB_COORD_BLOCK_SIZE}-unit regions.`
        : `Moved ${changes.length} selected shape${changes.length === 1 ? "" : "s"} along ${drag.axis.toUpperCase()}.`);
    } else {
      updateUi();
    }
    scheduleRender();
    return changes.length > 0;
  }

  function getReferenceId() {
    const gameId = state.current?.selected?.game;
    return state.current?.scene?.references?.referenceId
      ?? state.catalog?.games?.find((game) => game.id === gameId)?.referenceId
      ?? gameId;
  }

  async function loadShapeLibrary() {
    const referenceId = getReferenceId();
    if (!referenceId) {
      throw new Error("Shape library is unavailable for this map.");
    }
    const cached = state.referenceDataByGame.get(referenceId);
    if (cached) {
      return { referenceId, data: cached };
    }
    const data = await fetchJson(appUrl(getReferenceDataPath(state.siteConfig, referenceId)));
    state.referenceDataByGame.set(referenceId, data);
    return { referenceId, data };
  }

  function setShapePickerView(view) {
    shapePickerView = view;
    const isAtlasView = view === "atlas";
    shapePickerList.classList.toggle("is-atlas-view", isAtlasView);
    shapePickerDetailsButton.setAttribute("aria-pressed", String(!isAtlasView));
    shapePickerAtlasButton.setAttribute("aria-pressed", String(isAtlasView));
    shapePickerDetailsButton.classList.toggle("is-active", !isAtlasView);
    shapePickerAtlasButton.classList.toggle("is-active", isAtlasView);
  }

  function setPickerType(type) {
    pickerType = type;
    const isGlobPicker = type === "glob";
    shapePickerTitle.textContent = isGlobPicker ? "Add Glob" : "Add Shape";
    shapePickerSearchLabel.textContent = isGlobPicker ? "Search globs" : "Search shapes";
    shapePickerSearch.placeholder = isGlobPicker ? "Index, shape, or frame" : "Shape name or number";
    shapePickerViewModes.hidden = isGlobPicker;
    shapePickerList.classList.toggle("is-glob-view", isGlobPicker);
  }

  function renderShapeRows() {
    globPreviewObserver?.disconnect();
    const filter = shapePickerSearch.value.trim().toLocaleLowerCase();
    const visibleRows = state.editor.shapeRows.filter((row) => (
      !filter
      || `${row.definition.shapeHex} ${row.definition.displayName} ${row.definition.label} ${row.definition.description}`.toLocaleLowerCase().includes(filter)
    ));
    shapePickerList.replaceChildren();
    globPreviewObserver?.disconnect();
    globPreviewObserver = null;
    globPickerGrid = null;
    globPickerTopSpacer = null;
    globPickerBottomSpacer = null;
    globPickerKey = null;
    renderedGlobWindowKey = null;
    globPickerButtons.clear();
    shapePickerList.classList.toggle("is-atlas-view", shapePickerView === "atlas");
    shapePreviewObserver?.disconnect();
    shapePreviewObserver = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const preview = entry.target;
          const atlasUrl = preview.dataset.atlasUrl;
          if (atlasUrl) {
            preview.style.backgroundImage = `url("${atlasUrl}")`;
          }
          observer.unobserve(preview);
        }
      }, { root: shapePickerList, rootMargin: "160px 0px" })
      : null;
    for (const row of visibleRows) {
      const button = document.createElement("button");
      button.className = "shape-picker-option";
      button.type = "button";
      button.disabled = row.sprites.length === 0;
      const preview = document.createElement("span");
      preview.className = "shape-picker-preview";
      const sprite = row.sprites.find((entry) => entry.frame === 0) ?? row.sprites[0];
      const atlas = sprite ? row.atlases.find((entry) => entry.id === sprite.atlasId) : null;
      if (sprite && atlas) {
        const fitScale = Math.min(48 / sprite.width, 48 / sprite.height);
        const scale = fitScale >= 1 ? Math.max(1, Math.floor(fitScale)) : fitScale;
        preview.dataset.atlasUrl = appUrl(getReferenceAtlasPath(state.siteConfig, getReferenceId(), atlas));
        preview.style.backgroundPosition = `${Math.round(28 - (sprite.x + sprite.width / 2) * scale)}px ${Math.round(28 - (sprite.y + sprite.height / 2) * scale)}px`;
        preview.style.backgroundSize = `${Math.round(atlas.width * scale)}px ${Math.round(atlas.height * scale)}px`;
        shapePreviewObserver?.observe(preview);
        if (!shapePreviewObserver) {
          preview.style.backgroundImage = `url("${preview.dataset.atlasUrl}")`;
        }
      } else {
        preview.textContent = row.definition.shapeHex ?? String(row.definition.shape);
      }
      const copy = document.createElement("span");
      copy.className = "shape-picker-copy";
      const name = document.createElement("span");
      name.className = "shape-picker-name";
      const displayName = row.definition.displayName || row.definition.label || "Unnamed shape";
      name.textContent = displayName;
      const code = document.createElement("span");
      code.className = "shape-picker-code";
      const shapeCode = row.definition.shapeHex ?? row.definition.shape;
      code.textContent = `${shapeCode} · ${row.sprites.length} frame${row.sprites.length === 1 ? "" : "s"}`;
      button.title = `${displayName} (${shapeCode})`;
      button.setAttribute("aria-label", `${displayName}, ${code.textContent}`);
      copy.append(name, code);
      button.append(preview, copy);
      button.addEventListener("click", () => {
        void beginShapePlacement(row).catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
      shapePickerList.append(button);
    }
    shapePickerCount.textContent = `${visibleRows.length} of ${state.editor.shapeRows.length} shapes`;
  }

  function buildGlobAssetIndexes(data, current = state.current) {
    const definitions = new Map([
      ...(data.shapeDefinitions ?? []),
      ...(current?.shapeDefinitions?.values?.() ?? [])
    ].map((definition) => [definition.id, definition]));
    const sprites = new Map([
      ...(data.sprites ?? []),
      ...(current?.spriteIndex?.values?.() ?? [])
    ].map((sprite) => [sprite.id, sprite]));
    const atlases = new Map([
      ...(data.atlases ?? []),
      ...(current?.scene?.atlases ?? [])
    ].map((atlas) => [atlas.id, atlas]));
    const spritesByShape = new Map();
    for (const sprite of sprites.values()) {
      if (!spritesByShape.has(sprite.shape)) {
        spritesByShape.set(sprite.shape, []);
      }
      spritesByShape.get(sprite.shape).push(sprite);
    }
    for (const spritesForShape of spritesByShape.values()) {
      spritesForShape.sort((left, right) => (left.frame !== 0) - (right.frame !== 0) || left.frame - right.frame);
    }
    return { definitions, sprites, atlases, spritesByShape };
  }

  function getGlobChildResources(child) {
    const definition = globAssetIndexes?.definitions.get(`shape:${child.shape}`) ?? null;
    const sprite = globAssetIndexes?.sprites.get(child.spriteId)
      ?? globAssetIndexes?.spritesByShape.get(child.shape)?.find((entry) => entry.frame === child.frame)
      ?? null;
    const atlas = sprite ? globAssetIndexes?.atlases.get(sprite.atlasId) ?? null : null;
    return definition && sprite && atlas ? { definition, sprite, atlas } : null;
  }

  function loadGlobAtlasImage(referenceId, atlas, current = state.current) {
    if (current?.atlasImages.has(atlas.id)) {
      return Promise.resolve(current.atlasImages.get(atlas.id));
    }
    const cacheKey = `${referenceId}:${atlas.id}`;
    if (!globAtlasImages.has(cacheKey)) {
      globAtlasImages.set(cacheKey, loadImage(appUrl(getReferenceAtlasPath(state.siteConfig, referenceId, atlas))).catch((error) => {
        globAtlasImages.delete(cacheKey);
        throw error;
      }));
    }
    return globAtlasImages.get(cacheKey).then((image) => {
      if (state.current === current) {
        current.atlasImages.set(atlas.id, image);
      }
      return image;
    });
  }

  function registerGlobAsset(current, resource, image) {
    current.shapeDefinitions.set(resource.definition.id, resource.definition);
    current.spriteIndex.set(resource.sprite.id, resource.sprite);
    current.atlasImages.set(resource.atlas.id, image);
  }

  async function drawGlobPickerPreview(canvas, row, data) {
    const current = state.current;
    const context = canvas.getContext("2d");
    if (!context || !current) {
      return;
    }
    const referenceId = getReferenceId();
    const renderable = [];
    for (const child of row.entry.children) {
      const resource = getGlobChildResources(child);
      if (!resource) {
        continue;
      }
      const image = await loadGlobAtlasImage(referenceId, resource.atlas, current);
      renderable.push({ child, ...resource, image });
    }
    if (state.current !== current || !canvas.isConnected) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!renderable.length) {
      return;
    }
    const bounds = renderable.map(({ child, sprite }) => {
      const anchor = mapWorldToScenePoint({ x: child.x * 4 + 2, y: child.y * 4 + 2, z: child.z });
      const left = anchor.x - sprite.xoff;
      const top = anchor.y - sprite.yoff;
      return { left, top, right: left + sprite.width, bottom: top + sprite.height };
    });
    const minLeft = Math.min(...bounds.map((item) => item.left));
    const minTop = Math.min(...bounds.map((item) => item.top));
    const maxRight = Math.max(...bounds.map((item) => item.right));
    const maxBottom = Math.max(...bounds.map((item) => item.bottom));
    const scale = Math.min(3, (canvas.width - 12) / Math.max(1, maxRight - minLeft), (canvas.height - 12) / Math.max(1, maxBottom - minTop));
    const offsetX = (canvas.width - (maxRight - minLeft) * scale) / 2 - minLeft * scale;
    const offsetY = (canvas.height - (maxBottom - minTop) * scale) / 2 - minTop * scale;
    context.imageSmoothingEnabled = false;
    for (const item of renderable.sort((left, right) => left.child.renderOrder - right.child.renderOrder || left.child.childIndex - right.child.childIndex)) {
      const anchor = mapWorldToScenePoint({ x: item.child.x * 4 + 2, y: item.child.y * 4 + 2, z: item.child.z });
      context.drawImage(
        item.image,
        item.sprite.x,
        item.sprite.y,
        item.sprite.width,
        item.sprite.height,
        (anchor.x - item.sprite.xoff) * scale + offsetX,
        (anchor.y - item.sprite.yoff) * scale + offsetY,
        item.sprite.width * scale,
        item.sprite.height * scale
      );
    }
  }

  function ensureGlobPreviewObserver() {
    if (globPreviewObserver || typeof IntersectionObserver !== "function") {
      return;
    }
    globPreviewObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const canvas = entry.target;
        void drawGlobPickerPreview(canvas, canvas._globRow, globPickerData).catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
        observer.unobserve(canvas);
      }
    }, { root: shapePickerList, rootMargin: "160px 0px" });
  }

  function ensureGlobPickerGrid() {
    if (globPickerGrid?.isConnected) {
      return;
    }
    globPickerTopSpacer = document.createElement("div");
    globPickerTopSpacer.className = "glob-picker-spacer";
    globPickerGrid = document.createElement("div");
    globPickerGrid.className = "glob-picker-grid";
    globPickerBottomSpacer = document.createElement("div");
    globPickerBottomSpacer.className = "glob-picker-spacer";
    shapePickerList.replaceChildren(globPickerTopSpacer, globPickerGrid, globPickerBottomSpacer);
    globPickerButtons.clear();
    renderedGlobWindowKey = null;
  }

  function createGlobPickerButton(row) {
    const button = document.createElement("button");
    button.className = "shape-picker-option glob-picker-option";
    button.type = "button";
    const preview = document.createElement("canvas");
    preview.className = "glob-picker-preview";
    preview.width = 144;
    preview.height = 84;
    preview.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "shape-picker-copy";
    const name = document.createElement("span");
    name.className = "shape-picker-name";
    const code = document.createElement("span");
    code.className = "shape-picker-code";
    copy.append(name, code);
    button.append(preview, copy);
    button._globPreview = preview;
    button._globName = name;
    button._globCode = code;
    button.addEventListener("click", () => {
      void beginGlobPlacement(button._globRow).catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    });
    updateGlobPickerButton(button, row);
    return button;
  }

  function updateGlobPickerButton(button, row) {
    const label = `Glob 0x${row.entry.index.toString(16).padStart(4, "0")}`;
    const childCount = `${row.entry.children.length} child${row.entry.children.length === 1 ? "" : "ren"}`;
    button._globRow = row;
    button._globPreview._globRow = row;
    button.disabled = row.entry.children.length === 0;
    button._globName.textContent = label;
    button._globCode.textContent = childCount;
    button.title = `${label} (${childCount})`;
    button.setAttribute("aria-label", button.title);
  }

  function renderGlobRows() {
    const data = globPickerData;
    const current = state.current;
    if (!data || !current) {
      return;
    }
    const pickerKey = `${current.selected.game}:${getReferenceId()}`;
    if (globPickerKey !== pickerKey) {
      globPreviewObserver?.disconnect();
      globPreviewObserver = null;
      globPickerKey = pickerKey;
      globPickerGrid = null;
      globPickerTopSpacer = null;
      globPickerBottomSpacer = null;
      globPickerButtons.clear();
      renderedGlobWindowKey = null;
    }
    const filter = shapePickerSearch.value.trim().toLocaleLowerCase();
    const visibleRows = globRows.filter((row) => !filter || row.searchText.includes(filter));
    shapePickerList.classList.remove("is-atlas-view");
    shapePickerList.classList.add("is-glob-view");
    shapePreviewObserver?.disconnect();
    ensureGlobPickerGrid();
    ensureGlobPreviewObserver();

    const columnGap = 7;
    const columnCount = Math.max(1, Math.floor((shapePickerList.clientWidth + columnGap) / (GLOB_PICKER_MIN_TILE_WIDTH + columnGap)));
    const totalRows = Math.ceil(visibleRows.length / columnCount);
    const scrollTop = shapePickerList.scrollTop;
    const viewHeight = Math.max(shapePickerList.clientHeight, GLOB_PICKER_ROW_STRIDE);
    const firstRow = Math.max(0, Math.floor(scrollTop / GLOB_PICKER_ROW_STRIDE) - GLOB_PICKER_OVERSCAN);
    const lastRow = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / GLOB_PICKER_ROW_STRIDE) + GLOB_PICKER_OVERSCAN);
    const windowKey = `${filter}:${columnCount}:${firstRow}:${lastRow}`;
    if (renderedGlobWindowKey === windowKey) {
      shapePickerCount.textContent = `${visibleRows.length} of ${globRows.length} globs`;
      return;
    }
    renderedGlobWindowKey = windowKey;

    globPickerTopSpacer.style.height = `${firstRow * GLOB_PICKER_ROW_STRIDE}px`;
    globPickerGrid.style.gridTemplateColumns = `repeat(${columnCount}, minmax(0, 1fr))`;
    globPickerBottomSpacer.style.height = `${Math.max(0, totalRows - lastRow) * GLOB_PICKER_ROW_STRIDE}px`;
    const firstEntry = firstRow * columnCount;
    const lastEntry = Math.min(visibleRows.length, lastRow * columnCount);
    const rows = visibleRows.slice(firstEntry, lastEntry);
    const visibleIndices = new Set(rows.map((row) => row.entry.index));
    for (const [index, button] of globPickerButtons) {
      if (visibleIndices.has(index)) {
        continue;
      }
      globPreviewObserver?.unobserve(button._globPreview);
      button.remove();
      globPickerButtons.delete(index);
    }

    let previousButton = null;
    for (const row of rows) {
      let button = globPickerButtons.get(row.entry.index);
      const isNew = !button;
      if (isNew) {
        button = createGlobPickerButton(row);
        globPickerButtons.set(row.entry.index, button);
      } else {
        updateGlobPickerButton(button, row);
      }
      const nextButton = previousButton ? previousButton.nextElementSibling : globPickerGrid.firstElementChild;
      if (button !== nextButton) {
        globPickerGrid.insertBefore(button, nextButton);
      }
      if (isNew) {
        if (globPreviewObserver) {
          globPreviewObserver.observe(button._globPreview);
        } else {
          void drawGlobPickerPreview(button._globPreview, row, data).catch((error) => {
            setStatus(error instanceof Error ? error.message : String(error));
          });
        }
      }
      previousButton = button;
    }
    shapePickerCount.textContent = `${visibleRows.length} of ${globRows.length} globs`;
  }

  async function openShapePicker() {
    if (!state.editor.mode || !isSupportedMap()) {
      return;
    }
    setPickerType("shape");
    shapePickerModal.hidden = false;
    shapePickerSearch.value = "";
    shapePickerCount.textContent = "Loading shapes...";
    shapePickerList.replaceChildren();
    try {
      const { data } = await loadShapeLibrary();
      if (!state.current || !shapePickerModal.isConnected) {
        return;
      }
      const spritesByShape = new Map();
      for (const sprite of data.sprites ?? []) {
        if (!spritesByShape.has(sprite.shape)) {
          spritesByShape.set(sprite.shape, []);
        }
        spritesByShape.get(sprite.shape).push(sprite);
      }
      for (const sprites of spritesByShape.values()) {
        sprites.sort((left, right) => left.frame - right.frame);
      }
      state.editor.shapeRows = (data.shapeDefinitions ?? [])
        .filter((definition) => Number.isInteger(definition.shape))
        .map((definition) => ({ definition, sprites: spritesByShape.get(definition.shape) ?? [], atlases: data.atlases ?? [] }))
        .sort((left, right) => left.definition.shape - right.definition.shape);
      renderShapeRows();
      shapePickerSearch.focus();
    } catch (error) {
      shapePickerCount.textContent = "Could not load shape library.";
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openGlobPicker() {
    if (!state.editor.mode || !isSupportedMap() || state.editor.currentLayer !== "glob") {
      return;
    }
    setPickerType("glob");
    shapePickerModal.hidden = false;
    shapePickerSearch.value = "";
    shapePickerList.scrollTop = 0;
    shapePickerCount.textContent = "Loading globs...";
    shapePickerList.replaceChildren();
    const current = state.current;
    try {
      const { data } = await loadShapeLibrary();
      if (!state.current || state.current !== current || !shapePickerModal.isConnected) {
        return;
      }
      const catalog = data.globCatalogs?.find((entry) => entry.gameId === current.selected.game);
      if (!catalog) {
        throw new Error("No glob catalog is available for this game's assets.");
      }
      globPickerData = data;
      globAssetIndexes = buildGlobAssetIndexes(data, current);
      globRows = catalog.entries.map((entry) => ({
        entry,
        searchText: `0x${entry.index.toString(16).padStart(4, "0")} ${entry.index} ${entry.children.map((child) => `${child.shape.toString(16)} ${child.frame}`).join(" ")}`.toLocaleLowerCase()
      }));
      renderGlobRows();
      shapePickerSearch.focus();
    } catch (error) {
      shapePickerCount.textContent = "Could not load glob catalog.";
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function getGlobParentTemplate(data, current) {
    const indexes = buildGlobAssetIndexes(data, current);
    const getResources = (definition, frame = null) => {
      const sprite = (Number.isInteger(frame) ? indexes.sprites.get(`sprite:${definition.shape}:${frame}`) : null)
        ?? indexes.spritesByShape.get(definition.shape)?.[0]
        ?? null;
      const atlas = sprite ? indexes.atlases.get(sprite.atlasId) ?? null : null;
      return sprite && atlas ? { definition, sprite, atlas } : null;
    };
    for (const record of current.mapSource.items) {
      const definition = indexes.definitions.get(`shape:${record.shape}`);
      if (definition?.family === 3) {
        const resources = getResources(definition, record.frame);
        if (resources) {
          return resources;
        }
      }
    }
    const candidates = [...indexes.definitions.values()]
      .filter((definition) => definition.family === 3)
      .sort((left, right) => left.shape - right.shape);
    for (const definition of candidates) {
      const resources = getResources(definition);
      if (resources) {
        return resources;
      }
    }
    throw new Error("No family-3 glob parent shape is available in the reference data.");
  }

  async function beginGlobPlacement(row) {
    if (!state.current || !state.editor.mode || state.editor.currentLayer !== "glob" || !globPickerData) {
      return;
    }
    const current = state.current;
    const data = globPickerData;
    const referenceId = getReferenceId();
    const template = getGlobParentTemplate(data, current);
    const parentImage = await loadGlobAtlasImage(referenceId, template.atlas, current);
    const children = await Promise.all(row.entry.children.map(async (child, childIndex) => {
      const resource = getGlobChildResources(child);
      if (!resource) {
        return { child: { ...child, childIndex }, resource: null, image: null };
      }
      const image = await loadGlobAtlasImage(referenceId, resource.atlas, current);
      return { child: { ...child, childIndex }, resource, image };
    }));
    if (state.current !== current) {
      return;
    }
    registerGlobAsset(current, template, parentImage);
    for (const child of children) {
      if (child.resource) {
        registerGlobAsset(current, child.resource, child.image);
      }
    }
    state.editor.placement = {
      type: "glob",
      globIndex: row.entry.index,
      globEntry: row.entry,
      globChildren: children,
      definition: template.definition,
      sprite: template.sprite,
      atlas: template.atlas,
      record: null,
      previewItem: null,
      previewItems: []
    };
    shapePickerModal.hidden = true;
    viewport.focus?.();
    if (state.lastPointerClient) {
      updatePlacementPreview(state.lastPointerClient.x, state.lastPointerClient.y);
    }
    updateUi();
    setStatus(`Placing glob 0x${row.entry.index.toString(16).padStart(4, "0")} at Z=0. Click to place or press Escape to cancel.`);
  }

  async function beginShapePlacement(row) {
    if (!state.current || !state.editor.mode || row.sprites.length === 0) {
      return;
    }
    const current = state.current;
    const sprite = row.sprites.find((entry) => entry.frame === 0) ?? row.sprites[0];
    const atlas = row.atlases.find((entry) => entry.id === sprite.atlasId);
    if (!atlas) {
      throw new Error(`Missing atlas for ${row.definition.shapeHex ?? row.definition.shape}.`);
    }
    let atlasImage = current.atlasImages.get(atlas.id);
    if (!atlasImage) {
      const referenceId = getReferenceId();
      atlasImage = await loadImage(appUrl(getReferenceAtlasPath(state.siteConfig, referenceId, atlas)));
    }
    if (state.current !== current) {
      return;
    }
    current.atlasImages.set(atlas.id, atlasImage);
    current.shapeDefinitions.set(row.definition.id, row.definition);
    current.spriteIndex.set(sprite.id, sprite);
    state.editor.placement = {
      definition: row.definition,
      sprite,
      atlas,
      record: null,
      previewItem: null
    };
    shapePickerModal.hidden = true;
    viewport.focus?.();
    if (state.lastPointerClient) {
      updatePlacementPreview(state.lastPointerClient.x, state.lastPointerClient.y);
    }
    updateUi();
    setStatus(`Placing ${row.definition.displayName || row.definition.shapeHex || "shape"}. Click to place or press Escape to cancel.`);
  }

  function createGlobPlacementItems(record, parentIndex, placement, preview = false) {
    const items = [];
    const orderedChildren = [...placement.globChildren].sort((left, right) => (
      left.child.renderOrder - right.child.renderOrder || left.child.childIndex - right.child.childIndex
    ));
    for (const { child, resource } of orderedChildren) {
      if (!resource) {
        continue;
      }
      const childRecord = {
        x: (record.x & GLOB_COORD_MASK) + (child.x << 2) + 2,
        y: (record.y & GLOB_COORD_MASK) + (child.y << 2) + 2,
        z: record.z + child.z,
        shape: child.shape,
        frame: child.frame,
        flags: 0,
        quality: 0,
        npcNum: 0,
        mapNum: record.mapNum,
        nextItem: 0,
        source: "glob"
      };
      const item = makeMapSceneItem(childRecord, null, resource.definition, resource.sprite, preview);
      item.id = preview
        ? `item:preview:glob:${placement.globIndex}:${child.childIndex}`
        : `item:edit:glob:${state.syntheticItemSerial += 1}`;
      item.source = "glob";
      item.mapSourceIndex = null;
      item.globParentMapSourceIndex = Number.isInteger(parentIndex) ? parentIndex : null;
      item.globIndex = placement.globIndex;
      item.globChildIndex = child.childIndex;
      items.push(item);
    }
    return items;
  }

  function updateGlobPlacementPreview(clientX, clientY) {
    const placement = state.editor.placement;
    if (!state.current || !placement) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const point = {
      x: (clientX - rect.left - state.offsetX) / state.zoom,
      y: (clientY - rect.top - state.offsetY) / state.zoom
    };
    const world = scenePointToMapWorld(point, 0, state.current.metadata.bounds);
    const position = snapGlobPlacementPosition(world);
    const record = {
      ...position,
      shape: placement.definition.shape,
      frame: placement.sprite.frame,
      flags: 0,
      quality: placement.globIndex,
      npcNum: 0,
      mapNum: 0,
      nextItem: 0,
      source: "fixed"
    };
    placement.record = record;
    placement.previewItem = makeMapSceneItem(record, null, placement.definition, placement.sprite, true);
    placement.previewItems = createGlobPlacementItems(record, null, placement, true);
    scheduleRender();
  }

  function updatePlacementPreview(clientX, clientY) {
    const placement = state.editor.placement;
    if (!state.current || !placement) {
      return;
    }
    if (placement.type === "glob") {
      updateGlobPlacementPreview(clientX, clientY);
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const point = {
      x: (clientX - rect.left - state.offsetX) / state.zoom,
      y: (clientY - rect.top - state.offsetY) / state.zoom
    };
    const hoveredItem = findItemAtPoint(point);
    const hoveredDefinition = hoveredItem ? getShapeDefinition(hoveredItem.shapeDefId) : null;
    const topZ = hoveredItem && Number.isFinite(hoveredDefinition?.dimensions?.z)
      ? hoveredItem.world.z + hoveredDefinition.dimensions.z * 8
      : 0;
    const world = scenePointToMapWorld(point, topZ, state.current.metadata.bounds);
    const position = snapMapPosition(world, state.editor.snapEnabled, state.editor.snapSize);
    const record = {
      ...position,
      shape: placement.definition.shape,
      frame: placement.sprite.frame,
      flags: 0,
      quality: 0,
      npcNum: 0,
      mapNum: 0,
      nextItem: 0,
      source: "fixed"
    };
    placement.record = record;
    placement.previewItem = makeMapSceneItem(record, null, placement.definition, placement.sprite, true);
    scheduleRender();
  }

  function cancelPlacement() {
    if (!state.editor.placement) {
      return false;
    }
    state.editor.placement = null;
    updateUi();
    scheduleRender();
    setStatus("Placement cancelled.");
    return true;
  }

  function appendSceneReference(placement) {
    const scene = state.current.scene;
    scene.shapeDefinitions ??= [];
    scene.sprites ??= [];
    scene.atlases ??= [];
    if (!scene.shapeDefinitions.some((definition) => definition.id === placement.definition.id)) {
      scene.shapeDefinitions.push(placement.definition);
    }
    if (!scene.sprites.some((sprite) => sprite.id === placement.sprite.id)) {
      scene.sprites.push(placement.sprite);
    }
    if (!scene.atlases.some((atlas) => atlas.id === placement.atlas.id)) {
      scene.atlases.push(placement.atlas);
    }
  }

  function updateCounts(delta) {
    const metadata = state.current.metadata;
    metadata.rawItemCount = Math.max(0, (metadata.rawItemCount ?? 0) + delta);
    metadata.itemCount = Math.max(0, (metadata.itemCount ?? 0) + delta);
    metadata.paintedItemCount = Math.max(0, state.current.scene.items.length);
  }

  function resortSceneItemsAndUpdateBounds() {
    const current = state.current;
    if (!current?.scene.items.length) {
      return false;
    }
    const result = sortMapEditorSceneItems(current.scene.items, current.shapeDefinitions, current.spriteIndex);
    if (!result.bounds || !result.prepared.length) {
      return false;
    }

    const previousBounds = current.metadata.bounds;
    const nextItems = result.prepared.map((node, drawOrder) => {
      const item = node.item.sceneItem;
      const width = node.right - node.left;
      const height = node.bottom - node.top;
      item.drawOrder = drawOrder;
      item.screen = {
        left: node.left - result.bounds.screenLeft,
        top: node.top - result.bounds.screenTop,
        right: node.right - result.bounds.screenLeft,
        bottom: node.bottom - result.bounds.screenTop,
        width,
        height,
        anchorX: Math.trunc(node.left - result.bounds.screenLeft + width / 2),
        anchorY: node.bottom - result.bounds.screenTop
      };
      return item;
    });
    current.scene.items = nextItems;
    current.metadata.bounds = result.bounds;
    current.scene.metadata.bounds = result.bounds;

    if (previousBounds) {
      state.offsetX += (result.bounds.screenLeft - previousBounds.screenLeft) * state.zoom;
      state.offsetY += (result.bounds.screenTop - previousBounds.screenTop) * state.zoom;
    }
    clampViewport?.();
    setMeta(current.metadata);
    return true;
  }

  function finalizeMutation(delta) {
    const mapSource = state.current.mapSource;
    mapSource.itemCount = mapSource.items.length;
    mapSource.originalByteLength = mapSource.items.length * mapSource.itemRecordSize;
    state.current.scene.mapSource = mapSource;
    resortSceneItemsAndUpdateBounds();
    updateCounts(delta);
    refreshCurrentDerivedCollections();
    resetRenderCaches();
    setMapBinaryDownloadState(true);
    setMeta(state.current.metadata);
    updateDirtyState();
    scheduleRender();
  }

  function placeGlob() {
    const placement = state.editor.placement;
    if (!state.current || placement?.type !== "glob" || !placement.record) {
      return false;
    }
    const index = state.current.mapSource.items.length;
    const record = cloneMapRecord(placement.record);
    const item = makeMapSceneItem(record, index, placement.definition, placement.sprite, false);
    const nextDrawOrder = Math.max(-1, ...state.current.scene.items.map((entry) => entry.drawOrder ?? -1)) + 1;
    item.drawOrder = nextDrawOrder;
    appendSceneReference(placement);
    for (const child of placement.globChildren) {
      if (child.resource) {
        appendSceneReference(child.resource);
      }
    }
    const globChildren = createGlobPlacementItems(record, index, placement, false);
    globChildren.forEach((child, childIndex) => {
      child.drawOrder = nextDrawOrder + childIndex + 1;
    });
    state.current.mapSource.items.push(record);
    state.current.scene.items.push(item, ...globChildren);
    state.editor.placement = null;
    state.editor.selectedIds.clear();
    state.editor.globSelection = { parentMapSourceIndex: index, globIndex: record.quality };
    state.editor.globHover = state.editor.globSelection;
    finalizeMutation(1);
    pushHistory({
      type: "add",
      entries: [{
        index,
        record,
        item: cloneSceneItem(item),
        globChildren: globChildren.map(cloneSceneItem)
      }]
    });
    updateUi();
    setStatus(`Added glob 0x${record.quality.toString(16).padStart(4, "0")}.`);
    return true;
  }

  function placeShape() {
    const placement = state.editor.placement;
    if (!state.current || !placement?.record) {
      return false;
    }
    if (placement.type === "glob") {
      return placeGlob();
    }
    const index = state.current.mapSource.items.length;
    const record = cloneMapRecord(placement.record);
    const item = makeMapSceneItem(record, index, placement.definition, placement.sprite, false);
    appendSceneReference(placement);
    state.current.mapSource.items.push(record);
    state.current.scene.items.push(item);
    item.drawOrder = Math.max(-1, ...state.current.scene.items.map((entry) => entry.drawOrder ?? -1)) + 1;
    state.editor.placement = null;
    state.editor.selectedIds = new Set([item.id]);
    finalizeMutation(1);
    pushHistory({ type: "add", entries: [{ index, record, item: cloneSceneItem(item) }] });
    updateUi();
    setStatus(`Added ${placement.definition.displayName || placement.definition.shapeHex || "shape"}.`);
    return true;
  }

  function getEntriesForSelection() {
    return getSelectedSourceItems().map((item) => ({
      index: item.mapSourceIndex,
      record: cloneMapRecord(state.current.mapSource.items[item.mapSourceIndex]),
      item: cloneSceneItem(item),
      globChildren: state.current.scene.items
        .filter((child) => child.source === "glob" && child.globParentMapSourceIndex === item.mapSourceIndex)
        .map(cloneSceneItem)
    })).sort((left, right) => left.index - right.index);
  }

  function remapFixedItems(removedIndices = [], insertedIndices = []) {
    const removed = new Set(removedIndices);
    const hidden = state.current.hiddenIds;
    const nextHidden = new Set();
    for (const item of state.current.scene.items) {
      if (item.source === "glob" && Number.isInteger(item.globParentMapSourceIndex)) {
        const oldId = item.id;
        const oldParentIndex = item.globParentMapSourceIndex;
        const removeShift = removedIndices.filter((index) => index < oldParentIndex).length;
        const nextParentIndex = oldParentIndex - removeShift;
        const insertShift = insertedIndices.filter((index) => index <= nextParentIndex).length;
        item.globParentMapSourceIndex = nextParentIndex + insertShift;
        if (hidden.has(oldId)) {
          nextHidden.add(oldId);
        }
        continue;
      }
      if (item.source !== "fixed" || !Number.isInteger(item.mapSourceIndex)) {
        continue;
      }
      const oldId = item.id;
      if (removed.has(item.mapSourceIndex)) {
        continue;
      }
      const shift = removedIndices.filter((index) => index < item.mapSourceIndex).length;
      item.mapSourceIndex -= shift;
      const insertShift = insertedIndices.filter((index) => index <= item.mapSourceIndex).length;
      item.mapSourceIndex += insertShift;
      item.id = `fixed:${item.mapSourceIndex}`;
      if (hidden.has(oldId)) {
        nextHidden.add(item.id);
      }
    }
    state.current.hiddenIds = nextHidden;
    state.editor.selectedIds.clear();
    state.editor.globSelection = null;
    state.editor.globHover = null;
    state.editor.hoverAxis = null;
    state.pinnedItemId = null;
    state.hoverItemId = null;
  }

  function removeEntries(entries) {
    if (!entries.length || !state.current) {
      return;
    }
    const indices = entries.map((entry) => entry.index).sort((left, right) => left - right);
    const removed = new Set(indices);
    state.current.mapSource.items = state.current.mapSource.items.filter((_, index) => !removed.has(index));
    state.current.scene.items = state.current.scene.items.filter((item) => (
      (item.source !== "fixed" || !removed.has(item.mapSourceIndex))
      && (item.source !== "glob" || !removed.has(item.globParentMapSourceIndex))
    ));
    remapFixedItems(indices, []);
    finalizeMutation(-entries.length);
  }

  function insertEntries(entries) {
    if (!entries.length || !state.current) {
      return;
    }
    const sortedEntries = [...entries].sort((left, right) => left.index - right.index);
    const insertedIndices = sortedEntries.map((entry) => entry.index);
    for (const item of state.current.scene.items) {
      if (item.source === "fixed" && Number.isInteger(item.mapSourceIndex)) {
        const oldId = item.id;
        item.mapSourceIndex += insertedIndices.filter((index) => index <= item.mapSourceIndex).length;
        item.id = `fixed:${item.mapSourceIndex}`;
        if (state.current.hiddenIds.has(oldId)) {
          state.current.hiddenIds.delete(oldId);
          state.current.hiddenIds.add(item.id);
        }
      } else if (item.source === "glob" && Number.isInteger(item.globParentMapSourceIndex)) {
        const shift = insertedIndices.filter((index) => index <= item.globParentMapSourceIndex).length;
        item.globParentMapSourceIndex += shift;
      }
    }
    for (const entry of sortedEntries) {
      state.current.mapSource.items.splice(entry.index, 0, cloneMapRecord(entry.record));
      const item = cloneSceneItem(entry.item);
      item.mapSourceIndex = entry.index;
      item.id = `fixed:${entry.index}`;
      state.current.scene.items.push(item);
      for (const childSnapshot of entry.globChildren ?? []) {
        const child = cloneSceneItem(childSnapshot);
        child.globParentMapSourceIndex = entry.index;
        state.current.scene.items.push(child);
      }
    }
    state.current.scene.items.sort((left, right) => (left.drawOrder ?? 0) - (right.drawOrder ?? 0));
    const restoredGlob = state.editor.currentLayer === "glob"
      && sortedEntries.length === 1
      && sortedEntries[0].item.egg?.type === "glob"
      ? sortedEntries[0]
      : null;
    if (restoredGlob) {
      state.editor.selectedIds.clear();
      state.editor.globSelection = {
        parentMapSourceIndex: restoredGlob.index,
        globIndex: restoredGlob.record.quality
      };
      state.editor.globHover = state.editor.globSelection;
    } else {
      state.editor.selectedIds = new Set(sortedEntries.map((entry) => `fixed:${entry.index}`));
      state.editor.globSelection = null;
      state.editor.globHover = null;
    }
    finalizeMutation(entries.length);
  }

  function moveRecords(changes, field) {
    for (const change of changes) {
      applyRecordPosition(change.index, change[field]);
    }
    resortSceneItemsAndUpdateBounds();
    state.current.scene.mapSource = state.current.mapSource;
    resetRenderCaches();
    refreshCurrentDerivedCollections();
    scheduleRender();
  }

  function undo() {
    const command = state.editor.history.pop();
    if (!command || !state.current) {
      return false;
    }
    if (command.type === "move") {
      moveRecords(command.changes, "before");
    } else if (command.type === "add") {
      removeEntries(command.entries);
    } else if (command.type === "delete") {
      insertEntries(command.entries);
    }
    state.editor.future.push(command);
    updateDirtyState();
    setStatus("Map edit undone.");
    return true;
  }

  function redo() {
    const command = state.editor.future.pop();
    if (!command || !state.current) {
      return false;
    }
    if (command.type === "move") {
      moveRecords(command.changes, "after");
    } else if (command.type === "add") {
      insertEntries(command.entries);
    } else if (command.type === "delete") {
      removeEntries(command.entries);
    }
    state.editor.history.push(command);
    updateDirtyState();
    setStatus("Map edit redone.");
    return true;
  }

  function deleteSelected() {
    if (!state.current || !state.editor.mode) {
      return false;
    }
    const entries = getEntriesForSelection();
    if (!entries.length) {
      return false;
    }
    const hasConfiguredItems = entries.some(({ item, record }) => (
      item.egg
      || ["egg", "editor", "helper"].includes(item.kind)
      || record.nextItem !== 0
      || record.npcNum !== 0
      || record.mapNum !== 0
    ));
    if (hasConfiguredItems && !window.confirm("Some selected records may contain linked or configured data. Delete these records anyway?")) {
      return false;
    }
    removeEntries(entries);
    pushHistory({ type: "delete", entries });
    updateUi();
    setStatus(`Deleted ${entries.length} shape${entries.length === 1 ? "" : "s"}.`);
    return true;
  }

  function deleteGlobSelection() {
    if (!state.current || !state.editor.mode || state.editor.currentLayer !== "glob") {
      return false;
    }
    const [item] = getSelectedGlobParentItems();
    if (!item) {
      return false;
    }
    const entry = {
      index: item.mapSourceIndex,
      record: cloneMapRecord(state.current.mapSource.items[item.mapSourceIndex]),
      item: cloneSceneItem(item),
      globChildren: getSelectedGlobChildren().map(cloneSceneItem)
    };
    removeEntries([entry]);
    pushHistory({ type: "delete", entries: [entry] });
    updateUi();
    setStatus(`Deleted glob 0x${item.quality.toString(16).padStart(4, "0")} and ${entry.globChildren.length} geometry items.`);
    return true;
  }

  function finishEditDrag() {
    const drag = state.editor.drag;
    return drag ? finishGizmoDrag() : false;
  }

  function attachEventHandlers() {
    editModeButton.addEventListener("click", () => setMode(!state.editor.mode));
    shapeAddButton.addEventListener("click", () => {
      void (state.editor.currentLayer === "glob" ? openGlobPicker() : openShapePicker());
    });
    editorCurrentLayerSelect.addEventListener("change", () => setCurrentLayer(editorCurrentLayerSelect.value));
    editorGlobOutlinesCheckbox.addEventListener("change", () => {
      state.editor.globOutlinesEnabled = editorGlobOutlinesCheckbox.checked;
      scheduleRender();
    });
    editorOnlyShowCurrentLayerCheckbox.addEventListener("change", () => {
      state.editor.onlyShowCurrentLayer = editorOnlyShowCurrentLayerCheckbox.checked;
      updateUi();
      scheduleRender();
    });
    editUndoButton.addEventListener("click", undo);
    editRedoButton.addEventListener("click", redo);
    editDeleteButton.addEventListener("click", deleteSelected);
    editorGridSnapCheckbox.addEventListener("change", () => {
      state.editor.snapEnabled = editorGridSnapCheckbox.checked;
      updateUi();
      scheduleRender();
    });
    editorGridSizeSelect.addEventListener("change", () => {
      const value = Number.parseInt(editorGridSizeSelect.value, 10);
      if ([16, 32, 64, 128].includes(value)) {
        state.editor.snapSize = value;
      }
      updateUi();
    });
    editorFloorGridCheckbox.addEventListener("change", () => {
      state.editor.floorGridEnabled = editorFloorGridCheckbox.checked;
      scheduleRender();
    });
    shapePickerCloseButton.addEventListener("click", () => {
      shapePickerModal.hidden = true;
    });
    shapePickerDetailsButton.addEventListener("click", () => setShapePickerView("details"));
    shapePickerAtlasButton.addEventListener("click", () => setShapePickerView("atlas"));
    shapePickerModal.addEventListener("click", (event) => {
      if (event.target === shapePickerModal) {
        shapePickerModal.hidden = true;
      }
    });
    shapePickerList.addEventListener("scroll", () => {
      if (pickerType === "glob" && !shapePickerModal.hidden) {
        renderGlobRows();
      }
    }, { passive: true });
    window.addEventListener("resize", () => {
      if (pickerType === "glob" && !shapePickerModal.hidden) {
        renderGlobRows();
      }
    });
    shapePickerSearch.addEventListener("input", () => {
      if (pickerType === "glob") {
        shapePickerList.scrollTop = 0;
        renderGlobRows();
      } else {
        renderShapeRows();
      }
    });
  }

  updateUi();
  return {
    attachEventHandlers,
    beginGizmoDrag,
    cancelPlacement,
    clearSelection,
    closeShapePicker: () => { shapePickerModal.hidden = true; },
    deleteSelected,
    deleteGlobSelection,
    finishEditDrag,
    getGizmoAxisAtPoint,
    isSupportedMap,
    isSelectableItem: isEditorSelectableItem,
    markSaved,
    markChanged: updateDirtyState,
    openShapePicker,
    openGlobPicker,
    placeShape,
    redo,
    resetForScene,
    selectItem,
    undo,
    updateGizmoDrag,
    updatePlacementPreview,
    updateUi
  };
}