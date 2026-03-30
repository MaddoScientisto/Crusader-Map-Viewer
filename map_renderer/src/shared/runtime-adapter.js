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
    ? "Admin mode is active. Pin a shape to edit its catalog name, description, roof, transparency, and black out-of-bounds surface values."
    : "";
}

export function getCatalogDataPath(siteConfig) {
  return isStaticSite(siteConfig)
    ? String(siteConfig?.catalogUrl ?? "./data/catalog.json")
    : "api/maps";
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
  if (isStaticSite(siteConfig)) {
    return `${trimTrailingSlash(siteConfig?.staticMapsBaseUrl ?? "./data/maps")}/${selected.game}/map-${selected.mapId}/${atlas.fileName}`;
  }
  return `api/maps/${selected.game}/${selected.mapId}/atlases/${atlas.id}.png?buildId=${encodeURIComponent(jobId)}`;
}
