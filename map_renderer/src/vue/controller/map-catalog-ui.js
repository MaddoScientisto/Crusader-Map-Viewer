import { versionSelect, mapSelect, mapPrevButton, mapNextButton, catalogEditingHint, catalogExportButtons, emptyState } from "./dom-elements.js";
import { state } from "./state.js";
import { appUrl, isStaticMode, canEditCatalog } from "../../public/helpers.js";
import {
  getCatalogDownloadPath,
  getCatalogEditingHint,
  getCatalogUpdatePath,
  getEmptyStateMessage
} from "../../shared/runtime-adapter.js";

export function getSelectedMap() {
  if (!mapSelect.value) {
    return null;
  }

  try {
    return JSON.parse(mapSelect.value);
  } catch {
    return null;
  }
}

export function getSelectedVersion() {
  if (!state.catalog?.games?.length) {
    return null;
  }
  return state.catalog.games.find((game) => game.id === versionSelect.value) ?? state.catalog.games[0] ?? null;
}

function getVersionById(gameId) {
  if (!state.catalog?.games?.length) {
    return null;
  }
  return state.catalog.games.find((game) => game.id === gameId) ?? null;
}

function versionHasMapId(version, mapId) {
  return Number.isInteger(mapId) && version.maps.some((map) => map.id === mapId);
}

export function rememberSelection(selected) {
  if (!selected || !Number.isInteger(selected.mapId)) {
    return;
  }
  const version = getVersionById(selected.game);
  if (!version) {
    return;
  }
  state.selectionMemory.byVersion[selected.game] = { game: selected.game, mapId: selected.mapId };
  state.selectionMemory.byFamily[version.gameId] = { game: selected.game, mapId: selected.mapId };
}

function resolvePreferredSelection(selectedVersion, previousSelection = null) {
  if (!selectedVersion) {
    return null;
  }

  if (previousSelection?.game === selectedVersion.id && versionHasMapId(selectedVersion, previousSelection.mapId)) {
    return { game: selectedVersion.id, mapId: previousSelection.mapId };
  }

  if (selectedVersion.maps.length === 1) {
    return { game: selectedVersion.id, mapId: selectedVersion.maps[0].id };
  }

  const previousVersion = previousSelection ? getVersionById(previousSelection.game) : null;
  const sameFamily = previousVersion?.gameId === selectedVersion.gameId;
  if (sameFamily && previousVersion?.mapCount === selectedVersion.mapCount && versionHasMapId(selectedVersion, previousSelection?.mapId)) {
    return { game: selectedVersion.id, mapId: previousSelection.mapId };
  }

  const versionMemory = state.selectionMemory.byVersion[selectedVersion.id];
  if (versionHasMapId(selectedVersion, versionMemory?.mapId)) {
    return { game: selectedVersion.id, mapId: versionMemory.mapId };
  }

  const familyMemory = state.selectionMemory.byFamily[selectedVersion.gameId];
  if (versionHasMapId(selectedVersion, familyMemory?.mapId)) {
    return { game: selectedVersion.id, mapId: familyMemory.mapId };
  }

  return null;
}

function createMapValue(gameId, mapId) {
  return JSON.stringify({ game: gameId, mapId });
}

export function syncVersionSelection(preferredSelection = null) {
  const selectedVersion = getSelectedVersion();

  mapSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.textContent = selectedVersion ? "Select a map" : "No detected maps";
  placeholder.value = "";
  mapSelect.append(placeholder);

  if (!selectedVersion) {
    mapSelect.disabled = true;
    updateMapNavigationState();
    return null;
  }

  for (const map of selectedVersion.maps) {
    const option = document.createElement("option");
    option.value = createMapValue(selectedVersion.id, map.id);
    option.textContent = `${map.label} (${map.rawItemCount} items)`;
    mapSelect.append(option);
  }

  const resolvedSelection = resolvePreferredSelection(selectedVersion, preferredSelection);
  if (Number.isInteger(resolvedSelection?.mapId)) {
    const preferredValue = createMapValue(selectedVersion.id, resolvedSelection.mapId);
    const hasMatch = [...mapSelect.options].some((option) => option.value === preferredValue);
    mapSelect.value = hasMatch ? preferredValue : "";
  } else {
    mapSelect.value = "";
  }

  mapSelect.disabled = selectedVersion.maps.length === 0;
  if (mapSelect.value) {
    rememberSelection(getSelectedMap());
  }
  updateMapNavigationState();
  return selectedVersion;
}

export function getCatalogMapSelections() {
  const selectedVersion = getSelectedVersion();
  if (!selectedVersion) {
    return [];
  }
  return selectedVersion.maps.map((map) => ({ game: selectedVersion.id, mapId: map.id }));
}

export function getSelectedMapIndex() {
  const selected = getSelectedMap();
  if (!selected) {
    return -1;
  }
  return getCatalogMapSelections().findIndex((entry) => entry.game === selected.game && entry.mapId === selected.mapId);
}

export function updateMapNavigationState() {
  const catalogSelections = getCatalogMapSelections();
  const selectedIndex = getSelectedMapIndex();
  const hasSelection = selectedIndex >= 0;
  mapPrevButton.disabled = !hasSelection || selectedIndex === 0;
  mapNextButton.disabled = !hasSelection || selectedIndex === catalogSelections.length - 1;
}

export function stepSelectedMap(direction, scheduleAutoBuild) {
  const catalogSelections = getCatalogMapSelections();
  const selectedIndex = getSelectedMapIndex();
  const nextIndex = selectedIndex + direction;
  if (selectedIndex < 0 || nextIndex < 0 || nextIndex >= catalogSelections.length) {
    return;
  }

  mapSelect.value = JSON.stringify(catalogSelections[nextIndex]);
  rememberSelection(getSelectedMap());
  updateMapNavigationState();
  scheduleAutoBuild();
}

export function currentSelectionMatches(selected) {
  return Boolean(state.current && state.current.selected.game === selected.game && state.current.selected.mapId === selected.mapId);
}

export function applySiteConfig(setReloadState) {
  emptyState.textContent = getEmptyStateMessage(state.siteConfig);
  setReloadState(false);
  if (catalogEditingHint) {
    const enabled = canEditCatalog();
    catalogEditingHint.hidden = !enabled;
    catalogEditingHint.textContent = enabled ? getCatalogEditingHint(state.siteConfig) : "";
  }
}

export function populateCatalog(catalog, options) {
  const { setDownloadState, setReloadState, setStatus, downloadByUrl } = options;
  const previousSelection = getSelectedMap();
  const previousVersionId = versionSelect.value;
  state.catalog = catalog;

  versionSelect.innerHTML = "";
  for (const game of catalog.games) {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = `${game.selectorLabel ?? game.label} (${game.mapCount} maps)`;
    versionSelect.append(option);
  }

  if (catalog.games.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No detected versions";
    versionSelect.append(option);
    versionSelect.value = "";
  } else if (catalog.games.some((game) => game.id === previousVersionId)) {
    versionSelect.value = previousVersionId;
  } else {
    versionSelect.value = catalog.games[0].id;
  }

  versionSelect.disabled = catalog.games.length === 0;
  const selectedVersion = syncVersionSelection(previousSelection);
  setDownloadState(false);
  setReloadState(false);
  renderCatalogExportButtons(selectedVersion ? [selectedVersion] : [], { downloadByUrl, setStatus });
  if (catalog.games.length === 0) {
    setStatus(isStaticMode() ? "No exported maps were found in the committed static site bundle." : "No usable STATIC folders were detected under the app root.");
  } else {
    setStatus(isStaticMode() ? "Select a version and map to load its prebuilt static scene." : "Select a version and map to build its cached scene immediately.");
  }
}

export function getCatalogDownloadUrl(gameId) {
  return appUrl(getCatalogDownloadPath(state.siteConfig, gameId));
}

export function getCatalogUpdateUrl(gameId, shapeCode) {
  return appUrl(getCatalogUpdatePath(gameId, shapeCode));
}

export function renderCatalogExportButtons(games, options) {
  const { downloadByUrl, setStatus } = options;
  catalogExportButtons.innerHTML = "";
  for (const game of games) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-link";
    button.textContent = `Download ${game.label} CSV`;
    button.addEventListener("click", async () => {
      try {
        setStatus(`Downloading ${game.label} shape catalog CSV...`);
        await downloadByUrl(getCatalogDownloadUrl(game.id), `${game.id}-shape-catalog.csv`);
        setStatus(`Ready. ${game.label} shape catalog CSV downloaded.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
    catalogExportButtons.append(button);
  }
}
