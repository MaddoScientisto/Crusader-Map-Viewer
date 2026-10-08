import { loadImage } from "../../public/scene-api.js";
import { appUrl, fetchJson } from "../../public/helpers.js";
import { getReferenceAtlasPath, getReferenceDataPath } from "../../shared/runtime-adapter.js";
import {
  isEditorEditableItem,
  isEditorSelectableItem,
  getGizmoAxisWorldDelta,
  getSelectionGizmoCenter,
  hitTestGizmoAxis,
  isItemInEditorLayer,
  scenePointToMapWorld,
  snapMapPosition
} from "./map-editor-geometry.js";

const EDITABLE_MAP_FORMAT = "crusader-fixed-map-v1";
const MAX_HISTORY = 100;
const MAX_MAP_COORDINATE = 0x1fffe;

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
    canEditCatalog,
    setViewportModeHint,
    setStatus,
    refreshCurrentDerivedCollections,
    resetRenderCaches,
    scheduleRender,
    setMeta,
    setMapBinaryDownloadState,
    getShapeDefinition,
    findItemAtPoint,
    makeMapSceneItem,
    reprojectMapSceneItem
  } = deps;
  let shapePreviewObserver = null;
  let shapePickerView = "details";
  const shapePickerDetailsButton = shapePickerModal.querySelector("#shape-picker-details-button");
  const shapePickerAtlasButton = shapePickerModal.querySelector("#shape-picker-atlas-button");

  function isSupportedMap() {
    const mapSource = state.current?.mapSource;
    return Boolean(
      canEditCatalog()
      && mapSource?.formatVersion === EDITABLE_MAP_FORMAT
      && mapSource.binaryExportSupported !== false
    );
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
      : "Map editing requires a supported map in local admin mode";

    mapEditorToolbar.hidden = !state.editor.mode;
    shapeAddButton.disabled = !state.editor.mode || Boolean(state.editor.placement) || state.editor.currentLayer !== "fixed";
    shapeAddButton.setAttribute("aria-disabled", String(shapeAddButton.disabled));
    editorCurrentLayerSelect.value = state.editor.currentLayer;
    editorCurrentLayerSelect.disabled = !state.editor.mode || Boolean(state.editor.placement);
    editorOnlyShowCurrentLayerCheckbox.checked = state.editor.onlyShowCurrentLayer;
    editorGridSnapCheckbox.checked = state.editor.snapEnabled;
    editorGridSizeSelect.value = String(state.editor.snapSize);
    editorGridSizeSelect.disabled = !state.editor.mode || !state.editor.snapEnabled;
    editorFloorGridCheckbox.checked = state.editor.floorGridEnabled;
    editorSelectionCount.textContent = `${state.editor.selectedIds.size} selected`;
    editUndoButton.disabled = !state.editor.mode || state.editor.history.length === 0;
    editRedoButton.disabled = !state.editor.mode || state.editor.future.length === 0;
    editDeleteButton.disabled = !state.editor.mode || editableSelectionCount === 0;
    mapEditStatus.classList.toggle("is-dirty", state.editor.dirty);
    mapEditStatus.textContent = state.editor.dirty
      ? "Unsaved map edits. Download Map Binary to save the edited payload."
      : !hasMap
        ? "Choose a map to begin."
        : !supported
          ? "Editing is available in local admin mode for supported FIXED maps."
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
    state.editor.selectedIds.clear();
    state.editor.history = [];
    state.editor.future = [];
    state.editor.dirty = false;
    state.editor.drag = null;
    state.editor.hoverAxis = null;
    state.editor.placement = null;
    state.editor.shapeRows = [];
    state.editor.savedSnapshot = currentSnapshot();
    shapePickerModal.hidden = true;
    updateUi();
  }

  function setMode(active) {
    if (active && !isSupportedMap()) {
      setStatus("Map editing is available only for supported FIXED maps in local admin mode.");
      updateUi();
      return;
    }
    state.editor.mode = Boolean(active);
    state.editor.drag = null;
    state.editor.hoverAxis = null;
    state.editor.placement = null;
    shapePickerModal.hidden = true;
    if (!state.editor.mode) {
      state.editor.selectedIds.clear();
    }
    updateUi();
    scheduleRender();
    setStatus(state.editor.mode ? "Edit Mode enabled." : "Edit Mode disabled.");
  }

  function setCurrentLayer(layer) {
    if (!isItemInEditorLayer({ source: layer }, layer) || state.editor.currentLayer === layer) {
      return;
    }
    state.editor.currentLayer = layer;
    state.editor.selectedIds.clear();
    state.editor.hoverAxis = null;
    updateUi();
    scheduleRender();
  }

  function selectItem(item, event) {
    if (!state.editor.mode) {
      return;
    }
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
    state.editor.hoverAxis = null;
    updateUi();
    scheduleRender();
  }

  function clearSelection() {
    if (!state.editor.mode || state.editor.selectedIds.size === 0) {
      return;
    }
    state.editor.selectedIds.clear();
    updateUi();
    scheduleRender();
  }

  function getGizmoAxisAtPoint(point) {
    const editableSelectionIds = new Set(getSelectedSourceItems().map((item) => item.id));
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
    const entries = getSelectedSourceItems().map((item) => ({
      index: item.mapSourceIndex,
      item,
      before: recordPosition(state.current.mapSource.items[item.mapSourceIndex])
    }));
    if (!entries.length) {
      return false;
    }
    state.editor.drag = { axis, pointerId, clientX, clientY, entries, changed: false };
    state.editor.drag.entries = entries.map(({ index, item, before }) => ({ index, itemId: item.id, before }));
    return true;
  }

  function updateGizmoDrag(clientX, clientY) {
    const drag = state.editor.drag;
    if (!drag || !state.current) {
      return false;
    }
    let delta = getGizmoAxisWorldDelta(drag.axis, clientX - drag.clientX, clientY - drag.clientY, state.zoom);
    if (state.editor.snapEnabled) {
      delta = Math.round(delta / state.editor.snapSize) * state.editor.snapSize;
    }
    const coordinate = drag.axis === "x" ? "x" : drag.axis === "y" ? "y" : "z";
    if (coordinate !== "z") {
      delta = Math.round(delta / 2) * 2;
    } else {
      delta = Math.round(delta);
    }
    const maximum = coordinate === "z" ? 0xff : MAX_MAP_COORDINATE;
    const lowLimit = Math.max(...drag.entries.map((entry) => -entry.before[coordinate]));
    const highLimit = Math.min(...drag.entries.map((entry) => maximum - entry.before[coordinate]));
    delta = Math.min(highLimit, Math.max(lowLimit, delta));

    let changed = false;
    for (const entry of drag.entries) {
      const record = state.current.mapSource.items[entry.index];
      const nextPosition = { ...entry.before, [coordinate]: entry.before[coordinate] + delta };
      if (positionsEqual(recordPosition(record), nextPosition)) {
        continue;
      }
      record[coordinate] = nextPosition[coordinate];
      const item = state.current.itemIndex.get(entry.itemId);
      if (item) {
        reprojectMapSceneItem(item, record);
      }
      changed = true;
    }
    drag.changed = drag.changed || changed;
    if (changed) {
      state.current.scene.mapSource = state.current.mapSource;
      resetRenderCaches();
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
      pushHistory({ type: "move", axis: drag.axis, changes });
      setMapBinaryDownloadState(true);
      setStatus(`Moved ${changes.length} selected shape${changes.length === 1 ? "" : "s"} along ${drag.axis.toUpperCase()}.`);
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

  function renderShapeRows() {
    const filter = shapePickerSearch.value.trim().toLocaleLowerCase();
    const visibleRows = state.editor.shapeRows.filter((row) => (
      !filter
      || `${row.definition.shapeHex} ${row.definition.displayName} ${row.definition.label} ${row.definition.description}`.toLocaleLowerCase().includes(filter)
    ));
    shapePickerList.replaceChildren();
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

  async function openShapePicker() {
    if (!state.editor.mode || !isSupportedMap()) {
      return;
    }
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

  function updatePlacementPreview(clientX, clientY) {
    const placement = state.editor.placement;
    if (!state.current || !placement) {
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
    setStatus("Shape placement cancelled.");
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

  function finalizeMutation(delta) {
    const mapSource = state.current.mapSource;
    mapSource.itemCount = mapSource.items.length;
    mapSource.originalByteLength = mapSource.items.length * mapSource.itemRecordSize;
    state.current.scene.mapSource = mapSource;
    updateCounts(delta);
    refreshCurrentDerivedCollections();
    resetRenderCaches();
    setMapBinaryDownloadState(true);
    setMeta(state.current.metadata);
    updateDirtyState();
    scheduleRender();
  }

  function placeShape() {
    const placement = state.editor.placement;
    if (!state.current || !placement?.record) {
      return false;
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
      item: cloneSceneItem(item)
    })).sort((left, right) => left.index - right.index);
  }

  function remapFixedItems(removedIndices = [], insertedIndices = []) {
    const removed = new Set(removedIndices);
    const hidden = state.current.hiddenIds;
    const nextHidden = new Set();
    for (const item of state.current.scene.items) {
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
      item.source !== "fixed" || !removed.has(item.mapSourceIndex)
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
      }
    }
    for (const entry of sortedEntries) {
      state.current.mapSource.items.splice(entry.index, 0, cloneMapRecord(entry.record));
      const item = cloneSceneItem(entry.item);
      item.mapSourceIndex = entry.index;
      item.id = `fixed:${entry.index}`;
      state.current.scene.items.push(item);
    }
    state.current.scene.items.sort((left, right) => (left.drawOrder ?? 0) - (right.drawOrder ?? 0));
    state.editor.selectedIds = new Set(sortedEntries.map((entry) => `fixed:${entry.index}`));
    finalizeMutation(entries.length);
  }

  function moveRecords(changes, field) {
    for (const change of changes) {
      const record = state.current.mapSource.items[change.index];
      const item = state.current.itemIndex.get(`fixed:${change.index}`);
      Object.assign(record, change[field]);
      if (item) {
        reprojectMapSceneItem(item, record);
      }
    }
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

  function finishEditDrag() {
    const drag = state.editor.drag;
    return drag ? finishGizmoDrag() : false;
  }

  function attachEventHandlers() {
    editModeButton.addEventListener("click", () => setMode(!state.editor.mode));
    shapeAddButton.addEventListener("click", () => void openShapePicker());
    editorCurrentLayerSelect.addEventListener("change", () => setCurrentLayer(editorCurrentLayerSelect.value));
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
    shapePickerSearch.addEventListener("input", renderShapeRows);
  }

  updateUi();
  return {
    attachEventHandlers,
    beginGizmoDrag,
    cancelPlacement,
    clearSelection,
    closeShapePicker: () => { shapePickerModal.hidden = true; },
    deleteSelected,
    finishEditDrag,
    getGizmoAxisAtPoint,
    isSupportedMap,
    isSelectableItem: isEditorSelectableItem,
    markSaved,
    markChanged: updateDirtyState,
    openShapePicker,
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