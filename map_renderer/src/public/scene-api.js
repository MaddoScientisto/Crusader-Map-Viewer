import { state } from "../vue/controller/state.js";
import { appUrl } from "./helpers.js";
import {
  getAtlasPath,
  getDynamicBuildStatusPath,
  getDynamicBuildsPath,
  getDynamicScenePath,
  getStaticScenePath
} from "../shared/runtime-adapter.js";

export function getStaticSceneUrl(selected) {
  return appUrl(getStaticScenePath(state.siteConfig, selected));
}

export function getDynamicBuildsUrl() {
  return appUrl(getDynamicBuildsPath());
}

export function getDynamicBuildStatusUrl(jobId) {
  return appUrl(getDynamicBuildStatusPath(jobId));
}

export function getDynamicSceneUrl(selected, jobId) {
  return appUrl(getDynamicScenePath(selected, jobId));
}

export function getAtlasUrl(selected, jobId, atlas) {
  return appUrl(getAtlasPath(state.siteConfig, selected, jobId, atlas));
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
