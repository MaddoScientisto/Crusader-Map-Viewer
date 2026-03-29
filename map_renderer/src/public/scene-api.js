import { state } from "./state.js";
import { appUrl, trimTrailingSlash, isStaticMode } from "./helpers.js";

export function getStaticSceneUrl(selected) {
  return appUrl(`${trimTrailingSlash(state.siteConfig.staticMapsBaseUrl ?? "./data/maps")}/${selected.game}/map-${selected.mapId}/scene.json`);
}

export function getDynamicBuildsUrl() {
  return appUrl("api/builds");
}

export function getDynamicBuildStatusUrl(jobId) {
  return appUrl(`api/builds/${encodeURIComponent(jobId)}`);
}

export function getDynamicSceneUrl(selected, jobId) {
  const url = appUrl(`api/maps/${selected.game}/${selected.mapId}/scene`);
  url.searchParams.set("buildId", jobId);
  return url;
}

export function getAtlasUrl(selected, jobId, atlas) {
  if (isStaticMode()) {
    return appUrl(`${trimTrailingSlash(state.siteConfig.staticMapsBaseUrl ?? "./data/maps")}/${selected.game}/map-${selected.mapId}/${atlas.fileName}`);
  }
  const url = appUrl(`api/maps/${selected.game}/${selected.mapId}/atlases/${atlas.id}.png`);
  url.searchParams.set("buildId", jobId);
  return url;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = String(src);
  });
}

export async function loadSceneAssets(scene, selected, jobId) {
  const atlasImages = new Map();
  await Promise.all(
    scene.atlases.map(async (atlas) => {
      atlasImages.set(atlas.id, await loadImage(getAtlasUrl(selected, jobId, atlas)));
    })
  );
  return atlasImages;
}
