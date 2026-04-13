function trimTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/u, "");
}

export function getRuntimeMode(siteConfig) {
  return siteConfig?.mode === "static" ? "static" : "dynamic";
}

export function isStaticSite(siteConfig) {
  return getRuntimeMode(siteConfig) === "static";
}

export function canEditCatalogInRuntime(siteConfig) {
  return !isStaticSite(siteConfig) && siteConfig?.capabilities?.catalogEditing === true;
}

export function canReloadInRuntime(siteConfig) {
  return !isStaticSite(siteConfig) && siteConfig?.capabilities?.reload !== false;
}

export function getEmptyStateMessage(siteConfig) {
  return isStaticSite(siteConfig)
    ? "Choose a prebuilt map to view it."
    : "Choose a detected map to build and view it.";
}

export function getCatalogEditingHint(siteConfig) {
  return canEditCatalogInRuntime(siteConfig)
    ? "Admin mode is active. Pin a shape to edit its catalog name, description, roof, transparency, black out-of-bounds surface value, and 3D surface type."
    : "";
}

export function getCatalogDataPath(siteConfig) {
  return isStaticSite(siteConfig)
    ? String(siteConfig?.catalogUrl ?? "./data/catalog.json")
    : "api/maps";
}

export function getReferenceDataPath(siteConfig, referenceGameId) {
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.referenceDataBaseUrl ?? "./data/reference-data")}/${referenceGameId}.json`;
  }
  return `api/references/${referenceGameId}`;
}

export function getReferenceAtlasPath(siteConfig, referenceGameId, atlas) {
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.referenceAtlasBaseUrl ?? "./data/reference-atlases")}/${referenceGameId}/${atlas.fileName}`;
  }
  return `api/references/${referenceGameId}/atlases/${atlas.id}.png`;
}

export function getCatalogDownloadPath(siteConfig, gameId) {
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.catalogDownloadBaseUrl ?? "./data/catalogs")}/${gameId}.csv`;
  }
  return `api/catalogs/${gameId}.csv`;
}

export function getCatalogUpdatePath(gameId, shapeCode) {
  return `api/catalogs/${gameId}/entries/${shapeCode}`;
}

export function getNpcSpawnerDataPath(siteConfig) {
  return String(siteConfig?.npcSpawnerDataUrl ?? "./api/npc-spawner-data");
}

export function getStaticScenePath(siteConfig, selected) {
  return `${trimTrailingSlash(siteConfig?.staticMapsBaseUrl ?? "./data/maps")}/${selected.game}/map-${selected.mapId}/scene.json`;
}

export function getDynamicBuildsPath() {
  return "api/builds";
}

export function getDynamicBuildStatusPath(jobId) {
  return `api/builds/${encodeURIComponent(jobId)}`;
}

export function getDynamicScenePath(selected, jobId) {
  return `api/maps/${selected.game}/${selected.mapId}/scene?buildId=${encodeURIComponent(jobId)}`;
}

export function getAtlasPath(siteConfig, selected, jobId, atlas) {
  return getReferenceAtlasPath(siteConfig, atlas.referenceId ?? selected.game, atlas);
}

export function getUsecodeIndexPath(siteConfig, gameId) {
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.staticUsecodeBaseUrl ?? "./data/usecode")}/${gameId}/index.json`;
  }
  return `api/usecode/${gameId}`;
}

export function getUsecodeFilePath(siteConfig, gameId, filePath) {
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.staticUsecodeBaseUrl ?? "./data/usecode")}/${gameId}/${filePath}`;
  }
  return `api/usecode/${gameId}/raw?file=${encodeURIComponent(filePath)}`;
}
