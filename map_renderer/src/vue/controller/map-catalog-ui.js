import { mapSelect, mapPrevButton, mapNextButton, catalogEditingHint, catalogExportButtons, emptyState } from "./dom-elements.js";
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

export function getCatalogMapSelections() {
  if (!state.catalog?.games) {
    return [];
  }
  return state.catalog.games.flatMap((game) => game.maps.map((map) => ({ game: game.id, mapId: map.id })));
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
  state.catalog = catalog;
  mapSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.textContent = "Select a map";
  placeholder.value = "";
  mapSelect.append(placeholder);

  for (const game of catalog.games) {
    const group = document.createElement("optgroup");
    group.label = `${game.label} (${game.mapCount} maps)`;
    for (const map of game.maps) {
      const option = document.createElement("option");
      option.value = JSON.stringify({ game: game.id, mapId: map.id });
      option.textContent = `${map.label} (${map.rawItemCount} items)`;
      group.append(option);
    }
    mapSelect.append(group);
  }

  mapSelect.disabled = catalog.games.length === 0;
  updateMapNavigationState();
  setDownloadState(false);
  setReloadState(false);
  renderCatalogExportButtons(catalog.games, { downloadByUrl, setStatus });
  if (catalog.games.length === 0) {
    setStatus(isStaticMode() ? "No exported maps were found in the committed static site bundle." : "No usable STATIC folders were detected under the app root.");
  } else {
    setStatus(isStaticMode() ? "Select a map to load its prebuilt static scene." : "Select a map to build its cached scene immediately.");
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
