export function createSceneRuntimeController(deps) {
  const {
    state,
    viewport,
    overlayTooltip,
    panelResizer,
    mapForm,
    mapSelect,
    mapPrevButton,
    mapNextButton,
    includeEditorCheckbox,
    showEditorLinkArrowsCheckbox,
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
  const VIEWER_PREFERENCES_STORAGE_KEY = "crusader-map-renderer:viewer-preferences";
  const persistedCheckboxes = [
    ["includeEditor", includeEditorCheckbox],
    ["showEditorLinkArrows", showEditorLinkArrowsCheckbox],
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
          selectedMap: getSelectedMap(),
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
  }

  function restoreSelectedMap(preferences) {
    const selectedMap = preferences?.selectedMap;
    if (!selectedMap || typeof selectedMap !== "object") {
      return false;
    }

    const nextValue = JSON.stringify({
      game: selectedMap.game,
      mapId: selectedMap.mapId
    });
    const matchingOption = [...mapSelect.options].find((option) => option.value === nextValue);
    if (!matchingOption) {
      mapSelect.value = "";
      writeViewerPreferences();
      return false;
    }

    mapSelect.value = nextValue;
    updateMapNavigationState();
    writeViewerPreferences();
    return true;
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
      updateMapNavigationState();
      writeViewerPreferences();
      scheduleAutoBuild();
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
  }

  async function bootstrap() {
    const viewerPreferences = readViewerPreferences();
    restoreViewerOptions(viewerPreferences);
    setInspectMode(inspectShapesCheckbox.checked);
    state.siteConfig = await loadSiteConfig();
    await loadNpcSpawnerData(state.siteConfig);
    applySiteConfig(setReloadState);
    await loadCatalog();
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
