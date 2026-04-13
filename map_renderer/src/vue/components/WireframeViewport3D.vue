<template>
  <section class="wireframe-shell">
    <div ref="host" class="wireframe-host" tabindex="0"></div>
    <div class="wireframe-overlay">
      <div class="wireframe-badge">3D Surface View</div>
      <div class="wireframe-status">{{ statusText }}</div>
      <div class="wireframe-help">{{ helpText }}</div>
      <div v-if="wireframeCount > 0" class="wireframe-count">{{ wireframeCount }} wireframe</div>
      <div v-if="texturedCount > 0" class="wireframe-count">{{ texturedCount }} textured</div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";

import { state } from "../controller/state.js";
import { includeOobCheckbox, includeRoofsCheckbox, overlayTooltip, showBoundingBoxesCheckbox } from "../controller/dom-elements.js";
import { clearTooltipState, setTooltipState } from "../../shared/tooltip-bridge.js";
import { getCatalogUpdatePath } from "../../shared/runtime-adapter.js";
import { formatCatalogSurfaceTypeLabel, normalizeCatalogSurfaceType } from "../../shared/catalog-surface-types.js";
import {
  appUrl,
  canEditCatalog,
  catalogSnapshotsEqual,
  cloneCatalogSnapshot,
  decodeCatalogBoolean,
  escapeHtml,
  fetchJson
} from "../../public/helpers.js";

const host = ref(null);
const dragLooking = ref(false);
const statusText = ref("Choose a PC map to inspect it in 3D.");
const wireframeCount = ref(0);
const texturedCount = ref(0);

let renderer = null;
let scene = null;
let camera = null;
let worldGroup = null;
let gridHelper = null;
let selectionHighlightMesh = null;
let resizeObserver = null;
let animationFrame = 0;
let lastFrameTime = 0;
let currentRenderKey = null;
let tooltipLayoutFrame = 0;
let suppressNextClick = false;
let needsRender = true;
let currentPixelRatio = 1;

const lookState = {
  yaw: 0,
  pitch: -0.35
};

const sceneMetrics = {
  largestSpan: 512,
  height: 128
};

const dragState = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  moved: false
};

const lastPointer = {
  x: 0,
  y: 0,
  active: false
};

const pressedKeys = new Set();
const edgeGeometryCache = new Map();
const boxGeometryCache = new Map();
const materialCache = new Map();
const textureCache = new Map();
const spriteSourceCache = new Map();
const dynamicMaterials = [];
const interactiveObjects = [];
const itemRenderIndex = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const instanceMatrix = new THREE.Matrix4();
const identityQuaternion = new THREE.Quaternion();
const unitScale = new THREE.Vector3(1, 1, 1);

let hoveredItemId = null;
let pinnedItemId = null;

const KIND_COLORS = Object.freeze({
  base: 0xc6d3dd,
  terrain: 0x7fd2bf,
  roof: 0x7fb6ff,
  helper: 0x627487,
  egg: 0xffbd59,
  editor: 0xff8d6a
});

const WORLD_VERTICAL_SCALE = 3;

const helpText = computed(() => (
  dragLooking.value
    ? "Dragging to look. Release to stop. Right-click pins the hovered shape for tooltip editing."
    : "Hold the left mouse button and drag to look. WASD moves in view direction, Space rises, C descends, and right-click pins the hovered shape for tooltip editing."
));

function requestRender() {
  needsRender = true;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isPcSceneSelected() {
  return Boolean(state.current?.selected?.game) && !String(state.current.selected.game).startsWith("psx");
}

function getSceneRenderKey() {
  const current = state.current;
  if (!current || !isPcSceneSelected()) {
    return "empty";
  }
  return [
    current.selected.game,
    current.selected.mapId,
    current.dataRevision ?? 0,
    current.visibilityRevision ?? 0,
    includeRoofsCheckbox?.checked !== false,
    includeOobCheckbox?.checked !== false,
    showBoundingBoxesCheckbox?.checked === true
  ].join(":");
}

function setStatus(message) {
  statusText.value = message;
}

function getItemDefinition(item) {
  return state.current?.shapeDefinitions.get(item.shapeDefId) ?? null;
}

function getCatalogSurfaceType(definition) {
  return normalizeCatalogSurfaceType(definition?.catalogEntry?.surfaceType);
}

function applyCameraLook() {
  if (!camera) {
    return;
  }
  const cosPitch = Math.cos(lookState.pitch);
  const forward = new THREE.Vector3(
    Math.sin(lookState.yaw) * cosPitch,
    Math.sin(lookState.pitch),
    Math.cos(lookState.yaw) * cosPitch
  );
  camera.lookAt(camera.position.clone().add(forward));
  requestRender();
}

function syncLookFromDirection(direction) {
  const normalized = direction.clone().normalize();
  lookState.pitch = Math.asin(THREE.MathUtils.clamp(normalized.y, -0.995, 0.995));
  lookState.yaw = Math.atan2(normalized.x, normalized.z);
  applyCameraLook();
}

function getBoxGeometry(width, height, depth) {
  const cacheKey = `${width}:${height}:${depth}`;
  const cached = boxGeometryCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const geometry = new THREE.BoxGeometry(width, height, depth);
  boxGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function getEdgesGeometry(width, height, depth) {
  const cacheKey = `${width}:${height}:${depth}`;
  const cached = edgeGeometryCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const edgesGeometry = new THREE.EdgesGeometry(getBoxGeometry(width, height, depth));
  edgeGeometryCache.set(cacheKey, edgesGeometry);
  return edgesGeometry;
}

function getMaterial(kind, opacity = 1) {
  const normalizedOpacity = clamp(opacity, 0.1, 1);
  const cacheKey = `${kind || "base"}:${normalizedOpacity.toFixed(2)}`;
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.LineBasicMaterial({
    color: KIND_COLORS[kind || "base"] ?? KIND_COLORS.base,
    transparent: true,
    opacity: (kind === "helper" ? 0.55 : 0.9) * normalizedOpacity
  });
  materialCache.set(cacheKey, material);
  return material;
}

function getWireframeMaterial(kind, opacity = 1) {
  const normalizedOpacity = clamp(opacity, 0.1, 1);
  const cacheKey = `wireframe:${kind || "base"}:${normalizedOpacity.toFixed(2)}`;
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.MeshBasicMaterial({
    color: KIND_COLORS[kind || "base"] ?? KIND_COLORS.base,
    wireframe: true,
    transparent: true,
    opacity: (kind === "helper" ? 0.5 : 0.78) * normalizedOpacity,
    depthWrite: false
  });
  materialCache.set(cacheKey, material);
  return material;
}

function getSelectionHighlightMaterial(pinned = false) {
  const cacheKey = pinned ? "selection-highlight:pinned" : "selection-highlight:hover";
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.MeshBasicMaterial({
    color: pinned ? 0xfff1a8 : 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: pinned ? 0.9 : 0.72,
    depthTest: false,
    depthWrite: false
  });
  materialCache.set(cacheKey, material);
  return material;
}

function getHiddenPickMaterial() {
  const cacheKey = "pick-hidden";
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  material.colorWrite = false;
  materialCache.set(cacheKey, material);
  return material;
}

function getNeutralSurfaceMaterial(opacity = 1) {
  const normalizedOpacity = clamp(opacity, 0.1, 1);
  const cacheKey = `surface-neutral:${normalizedOpacity.toFixed(2)}`;
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.MeshBasicMaterial({
    color: 0x13212a,
    transparent: true,
    opacity: 0.22 * normalizedOpacity,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  materialCache.set(cacheKey, material);
  return material;
}

function trackDynamicMaterial(material) {
  dynamicMaterials.push(material);
  return material;
}

function createTexturedMaterial(texture, opacity = 1, transparentSurface = false) {
  const normalizedOpacity = clamp(opacity, 0.1, 1);
  const usesTransparency = transparentSurface || normalizedOpacity < 0.999;
  return trackDynamicMaterial(new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: usesTransparency ? 0.01 : 0.08,
    transparent: usesTransparency,
    opacity: normalizedOpacity,
    depthWrite: !usesTransparency,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide
  }));
}

function getSpriteSource(sprite, atlasImage) {
  if (!sprite || !atlasImage) {
    return null;
  }
  const cacheKey = `${sprite.id}:${sprite.atlasId}`;
  const cached = spriteSourceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvasElement = document.createElement("canvas");
  canvasElement.width = sprite.width;
  canvasElement.height = sprite.height;
  const context = canvasElement.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(atlasImage, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
  const imageData = context.getImageData(0, 0, sprite.width, sprite.height);
  const alphaRows = Array.from({ length: sprite.height }, () => ({ left: -1, right: -1 }));
  let top = -1;
  let bottom = -1;
  let left = sprite.width;
  let right = -1;
  let hasPartialAlpha = false;

  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      const alpha = imageData.data[(y * sprite.width + x) * 4 + 3];
      if (alpha < 16) {
        continue;
      }
      if (alpha < 250) {
        hasPartialAlpha = true;
      }
      if (top === -1) {
        top = y;
      }
      bottom = y;
      left = Math.min(left, x);
      right = Math.max(right, x);
      if (alphaRows[y].left === -1) {
        alphaRows[y].left = x;
      }
      alphaRows[y].right = x;
    }
  }

  const source = {
    imageData,
    alphaRows,
    hasPartialAlpha,
    width: sprite.width,
    height: sprite.height,
    bounds: top === -1
      ? { top: 0, bottom: sprite.height - 1, left: 0, right: sprite.width - 1 }
      : { top, bottom, left, right }
  };
  spriteSourceCache.set(cacheKey, source);
  return source;
}

function copyNearestSample(output, offset, source, x, y) {
  const clampedX = clamp(Math.round(x), 0, source.width - 1);
  const clampedY = clamp(Math.round(y), 0, source.height - 1);
  const sourceOffset = (clampedY * source.width + clampedX) * 4;
  output[offset] = source.imageData.data[sourceOffset];
  output[offset + 1] = source.imageData.data[sourceOffset + 1];
  output[offset + 2] = source.imageData.data[sourceOffset + 2];
  output[offset + 3] = source.imageData.data[sourceOffset + 3];
}

function computeTextureSize(sourceWidth, sourceHeight, aspect) {
  const normalizedAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const area = Math.max(sourceWidth * sourceHeight, 256);
  const width = clamp(Math.round(Math.sqrt(area * normalizedAspect)), 24, 512);
  const height = clamp(Math.round(width / normalizedAspect), 24, 512);
  return { width, height };
}

function sampleSpriteX(source, x, flipped) {
  return flipped ? (source.width - 1 - x) : x;
}

function interpolatePoint(topLeft, topRight, bottomLeft, bottomRight, u, v) {
  const invU = 1 - u;
  const invV = 1 - v;
  return {
    x: topLeft.x * invU * invV + topRight.x * u * invV + bottomLeft.x * invU * v + bottomRight.x * u * v,
    y: topLeft.y * invU * invV + topRight.y * u * invV + bottomLeft.y * invU * v + bottomRight.y * u * v
  };
}

function computeQuadBounds(points) {
  return points.reduce((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y)
  }), {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY
  });
}

function detectVisibleWallSide(source, anchorY, sideHeight) {
  const verticalStart = clamp(Math.round(anchorY - sideHeight), source.bounds.top, source.bounds.bottom);
  const edgeTolerance = Math.max(1, Math.round((source.bounds.right - source.bounds.left + 1) * 0.04));
  let leftEdgeHits = 0;
  let rightEdgeHits = 0;
  let measuredRows = 0;

  for (let y = verticalStart; y <= source.bounds.bottom; y += 1) {
    const row = source.alphaRows[y];
    if (!row || row.left === -1 || row.right === -1) {
      continue;
    }
    measuredRows += 1;
    if (row.left <= source.bounds.left + edgeTolerance) {
      leftEdgeHits += 1;
    }
    if (row.right >= source.bounds.right - edgeTolerance) {
      rightEdgeHits += 1;
    }
  }

  if (measuredRows === 0) {
    return "right";
  }

  return leftEdgeHits > rightEdgeHits ? "left" : "right";
}

function sampleSourceAlpha(source, x, y, flipped = false) {
  const clampedX = clamp(Math.round(sampleSpriteX(source, x, flipped)), 0, source.width - 1);
  const clampedY = clamp(Math.round(y), 0, source.height - 1);
  return source.imageData.data[(clampedY * source.width + clampedX) * 4 + 3] ?? 0;
}

function getEffectiveSpriteAnchorX(sprite, flipped = false) {
  if (!sprite) {
    return 0;
  }
  return flipped ? (sprite.width - 1 - sprite.xoff) : sprite.xoff;
}

function scoreQuadCoverage(source, quad, flipped = false, samplesU = 18, samplesV = 28) {
  let alphaTotal = 0;
  let hitCount = 0;
  const totalSamples = Math.max(1, samplesU * samplesV);

  for (let y = 0; y < samplesV; y += 1) {
    const v = samplesV <= 1 ? 0.5 : y / (samplesV - 1);
    for (let x = 0; x < samplesU; x += 1) {
      const u = samplesU <= 1 ? 0.5 : x / (samplesU - 1);
      const point = interpolatePoint(quad[0], quad[1], quad[2], quad[3], u, v);
      const alpha = sampleSourceAlpha(source, point.x, point.y, flipped);
      alphaTotal += alpha;
      if (alpha >= 16) {
        hitCount += 1;
      }
    }
  }

  return {
    averageAlpha: alphaTotal / totalSamples,
    hitRatio: hitCount / totalSamples,
    score: (alphaTotal / totalSamples) + (hitCount / totalSamples) * 255
  };
}

function buildQuadTexture(source, cacheKey, quad, aspect, flipped = false) {
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const bounds = computeQuadBounds(quad);
  const sourceWidth = Math.max(1, bounds.right - bounds.left);
  const sourceHeight = Math.max(1, bounds.bottom - bounds.top);
  const { width, height } = computeTextureSize(sourceWidth, sourceHeight, aspect);
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const context = canvasElement.getContext("2d");
  if (!context) {
    return null;
  }
  const imageData = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width <= 1 ? 0 : x / (width - 1);
      const point = interpolatePoint(quad[0], quad[1], quad[2], quad[3], u, v);
      copyNearestSample(
        imageData.data,
        (y * width + x) * 4,
        source,
        sampleSpriteX(source, point.x, flipped),
        point.y
      );
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

function buildSmoothedColumnProfiles(source) {
  const width = Math.max(1, source.bounds.right - source.bounds.left + 1);
  const topProfile = new Array(width).fill(-1);
  const bottomProfile = new Array(width).fill(-1);

  for (let y = source.bounds.top; y <= source.bounds.bottom; y += 1) {
    const row = source.alphaRows[y];
    if (!row || row.left === -1 || row.right === -1) {
      continue;
    }
    const start = clamp(Math.round(row.left), source.bounds.left, source.bounds.right);
    const end = clamp(Math.round(row.right), source.bounds.left, source.bounds.right);
    for (let x = start; x <= end; x += 1) {
      const index = x - source.bounds.left;
      if (topProfile[index] === -1) {
        topProfile[index] = y;
      }
      bottomProfile[index] = y;
    }
  }

  const fillMissing = (values, fallback) => {
    let last = fallback;
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] === -1) {
        values[index] = last;
      } else {
        last = values[index];
      }
    }
    last = fallback;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (values[index] === -1) {
        values[index] = last;
      } else {
        last = values[index];
      }
    }
  };

  fillMissing(topProfile, source.bounds.top);
  fillMissing(bottomProfile, source.bounds.bottom);

  const smooth = (values) => values.map((value, index) => {
    let total = 0;
    let weightTotal = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const sampleIndex = clamp(index + offset, 0, values.length - 1);
      const weight = offset === 0 ? 4 : Math.max(1, 3 - Math.abs(offset));
      total += values[sampleIndex] * weight;
      weightTotal += weight;
    }
    return total / Math.max(weightTotal, 1);
  });

  return {
    top: smooth(topProfile),
    bottom: smooth(bottomProfile)
  };
}

function buildFloorTexture(sprite, atlasImage, worldWidth, worldDepth, sideHeightPixels, flipped = false) {
  const source = getSpriteSource(sprite, atlasImage);
  if (!source) {
    return null;
  }
  const projectedTopHeight = (worldWidth + worldDepth) / 8;
  const derivedSideHeight = clamp(sprite.yoff - projectedTopHeight, 0, sprite.height);
  const sideHeight = Number.isFinite(derivedSideHeight) ? derivedSideHeight : Math.max(0, sideHeightPixels);
  const cacheKey = `floor:${sprite.id}:${worldWidth}:${worldDepth}:${Math.round(sideHeight)}:${flipped ? 1 : 0}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const { width, height } = computeTextureSize(source.width, source.height, worldWidth / Math.max(worldDepth, 1));
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const context = canvasElement.getContext("2d");
  if (!context) {
    return null;
  }
  const imageData = context.createImageData(width, height);
  const anchorX = sprite.xoff;
  const anchorY = sprite.yoff;
  const topLeft = {
    x: anchorX + (worldDepth - worldWidth) / 4,
    y: anchorY - sideHeight - projectedTopHeight
  };
  const topRight = {
    x: anchorX + worldDepth / 4,
    y: anchorY - sideHeight - worldDepth / 8
  };
  const bottomLeft = {
    x: anchorX - worldWidth / 4,
    y: anchorY - sideHeight - worldWidth / 8
  };
  const bottomRight = {
    x: anchorX,
    y: anchorY - sideHeight
  };

  for (let y = 0; y < height; y += 1) {
    const depthT = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const widthT = width <= 1 ? 0 : x / (width - 1);
      const point = interpolatePoint(topLeft, topRight, bottomLeft, bottomRight, widthT, depthT);
      copyNearestSample(
        imageData.data,
        (y * width + x) * 4,
        source,
        sampleSpriteX(source, point.x, flipped),
        point.y
      );
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

function buildWallTextures(sprite, atlasImage, wallWidth, wallDepth, wallHeight, flipped = false) {
  const source = getSpriteSource(sprite, atlasImage);
  if (!source) {
    return null;
  }
  const projectedTopHeight = (wallWidth + wallDepth) / 8;
  const sideHeight = clamp(sprite.yoff - projectedTopHeight, 0, sprite.height);
  const anchorX = sprite.xoff;
  const anchorY = sprite.yoff;

  const topLeft = {
    x: anchorX + (wallDepth - wallWidth) / 4,
    y: anchorY - sideHeight - projectedTopHeight
  };
  const topRight = {
    x: anchorX + wallDepth / 4,
    y: anchorY - sideHeight - wallDepth / 8
  };
  const bottomLeft = {
    x: anchorX - wallWidth / 4,
    y: anchorY - sideHeight - wallWidth / 8
  };
  const bottomRight = {
    x: anchorX,
    y: anchorY - sideHeight
  };
  const groundTopRight = {
    x: topRight.x,
    y: topRight.y + sideHeight
  };
  const groundTopLeft = {
    x: topLeft.x,
    y: topLeft.y + sideHeight
  };
  const groundBottomLeft = {
    x: bottomLeft.x,
    y: bottomLeft.y + sideHeight
  };
  const groundBottomRight = {
    x: bottomRight.x,
    y: bottomRight.y + sideHeight
  };
  const upperFrontQuad = [topLeft, topRight, groundTopLeft, groundTopRight];
  const lowerFrontQuad = [bottomLeft, bottomRight, groundBottomLeft, groundBottomRight];
  const rightSideQuad = [topRight, bottomRight, groundTopRight, groundBottomRight];
  const leftSideQuad = [topLeft, bottomLeft, groundTopLeft, groundBottomLeft];
  const upperFrontScore = scoreQuadCoverage(source, upperFrontQuad, flipped);
  const lowerFrontScore = scoreQuadCoverage(source, lowerFrontQuad, flipped);
  const leftSideScore = scoreQuadCoverage(source, leftSideQuad, flipped, 10, 28);
  const rightSideScore = scoreQuadCoverage(source, rightSideQuad, flipped, 10, 28);
  const anchorMidpoint = (sprite.width - 1) / 2;
  const effectiveAnchorX = getEffectiveSpriteAnchorX(sprite, flipped);
  const anchorBias = (effectiveAnchorX - anchorMidpoint) / Math.max(sprite.width, 1);
  const layoutBias = anchorBias * 40;
  const pairedLeftScore = upperFrontScore.score + leftSideScore.score + layoutBias;
  const pairedRightScore = lowerFrontScore.score + rightSideScore.score - layoutBias;
  const fallbackSide = detectVisibleWallSide(source, anchorY, sideHeight) === "left";
  const useLeftLayout = Math.abs(pairedLeftScore - pairedRightScore) < 8
    ? fallbackSide
    : pairedLeftScore > pairedRightScore;
  const useUpperFront = useLeftLayout;
  const useLeftSide = useLeftLayout;
  const selectedSideQuad = useLeftSide ? leftSideQuad : rightSideQuad;
  const selectedFrontQuad = useUpperFront ? upperFrontQuad : lowerFrontQuad;

  return {
    top: buildQuadTexture(
      source,
      `wall-top:${sprite.id}:${wallWidth}:${wallDepth}:${wallHeight}:${flipped ? 1 : 0}`,
      [topLeft, topRight, bottomLeft, bottomRight],
      wallWidth / Math.max(wallDepth, 1),
      flipped
    ),
    front: buildQuadTexture(
      source,
      `wall-front:${sprite.id}:${wallWidth}:${wallDepth}:${wallHeight}:${flipped ? 1 : 0}:${useUpperFront ? "u" : "l"}`,
      selectedFrontQuad,
      wallWidth / Math.max(wallHeight, 1),
      flipped
    ),
    side: buildQuadTexture(
      source,
      `wall-side:${sprite.id}:${wallWidth}:${wallDepth}:${wallHeight}:${flipped ? 1 : 0}:${useLeftSide ? "l" : "r"}`,
      selectedSideQuad,
      wallDepth / Math.max(wallHeight, 1),
      flipped
    ),
    frontOnUpperEdge: useUpperFront,
    sideOnLeft: useLeftSide
  };
}

function clearWorldGroup() {
  if (!worldGroup) {
    return;
  }
  interactiveObjects.length = 0;
  itemRenderIndex.clear();
  selectionHighlightMesh = null;
  while (worldGroup.children.length > 0) {
    worldGroup.remove(worldGroup.children[0]);
  }
  if (gridHelper) {
    scene?.remove(gridHelper);
    gridHelper.geometry.dispose();
    if (Array.isArray(gridHelper.material)) {
      for (const material of gridHelper.material) {
        material.dispose();
      }
    } else {
      gridHelper.material.dispose();
    }
    gridHelper = null;
  }
  while (dynamicMaterials.length > 0) {
    dynamicMaterials.pop()?.dispose?.();
  }
  requestRender();
}

function disposeTextureCache() {
  for (const texture of textureCache.values()) {
    texture.dispose?.();
  }
  textureCache.clear();
  spriteSourceCache.clear();
}

function createGrid(span) {
  const majorSpan = Math.max(256, Math.ceil(span / 256) * 256);
  const divisions = Math.max(8, Math.min(64, Math.round(majorSpan / 128)));
  return new THREE.GridHelper(majorSpan, divisions, 0x315567, 0x1b2d36);
}

function updateRendererQuality(visibleCount, texturedVisibleCount) {
  if (!renderer) {
    return;
  }
  const deviceRatio = window.devicePixelRatio || 1;
  const complexity = Math.max(visibleCount, texturedVisibleCount * 2);
  const nextPixelRatio = Math.min(
    deviceRatio,
    complexity >= 1800 ? 0.9 : complexity >= 900 ? 1 : 1.25
  );
  if (Math.abs(nextPixelRatio - currentPixelRatio) < 0.01) {
    return;
  }
  currentPixelRatio = nextPixelRatio;
  renderer.setPixelRatio(nextPixelRatio);
  resizeRenderer();
}

function resetCamera(selectionChanged) {
  if (!camera) {
    return;
  }
  const distance = Math.max(128, Math.min(1024, sceneMetrics.largestSpan * 0.22));
  const height = Math.max(72, Math.min(320, sceneMetrics.height * 0.28));
  if (!selectionChanged && currentRenderKey) {
    applyCameraLook();
    return;
  }
  camera.position.set(0, height, distance);
  syncLookFromDirection(new THREE.Vector3(0, Math.max(-0.35, -sceneMetrics.height / Math.max(distance * 1.5, 1)), -1));
}

function positionTooltip() {
  if (!overlayTooltip || overlayTooltip.hidden) {
    return;
  }
  if (pinnedItemId) {
    overlayTooltip.style.left = "auto";
    overlayTooltip.style.right = "16px";
    overlayTooltip.style.top = "16px";
    overlayTooltip.style.bottom = "16px";
    return;
  }
  if (!lastPointer.active) {
    return;
  }
  const containerRect = overlayTooltip.offsetParent?.getBoundingClientRect() ?? host.value?.getBoundingClientRect();
  const containerWidth = overlayTooltip.offsetParent?.clientWidth ?? host.value?.clientWidth ?? 0;
  const containerHeight = overlayTooltip.offsetParent?.clientHeight ?? host.value?.clientHeight ?? 0;
  if (!containerRect || !containerWidth || !containerHeight) {
    return;
  }
  const padding = 18;
  const tooltipWidth = overlayTooltip.offsetWidth;
  const tooltipHeight = overlayTooltip.offsetHeight;
  let left = lastPointer.x - containerRect.left + 18;
  let top = lastPointer.y - containerRect.top + 18;
  if (left + tooltipWidth + padding > containerWidth) {
    left = Math.max(padding, left - tooltipWidth - 36);
  }
  if (top + tooltipHeight + padding > containerHeight) {
    top = Math.max(padding, containerHeight - tooltipHeight - padding);
  }
  overlayTooltip.style.left = `${left}px`;
  overlayTooltip.style.top = `${top}px`;
  overlayTooltip.style.right = "auto";
  overlayTooltip.style.bottom = "auto";
}

function scheduleTooltipPosition() {
  window.cancelAnimationFrame(tooltipLayoutFrame);
  tooltipLayoutFrame = window.requestAnimationFrame(positionTooltip);
}

function hideTooltipOverlay() {
  if (overlayTooltip) {
    overlayTooltip.hidden = true;
    overlayTooltip.classList.remove("is-pinned", "is-hover");
  }
  clearTooltipState();
}

async function saveCatalogEntry(item, payload) {
  const definition = getItemDefinition(item);
  if (!state.current || !definition) {
    return;
  }
  const previousSnapshot = cloneCatalogSnapshot(definition.catalogEntry);
  const nextSnapshot = {
    humanReadableId: String(payload?.humanReadableId ?? "").trim(),
    description: String(payload?.description ?? "").trim(),
    surfaceType: normalizeCatalogSurfaceType(payload?.surfaceType),
    roof: decodeCatalogBoolean(String(payload?.roof ?? "")),
    semitransparency: decodeCatalogBoolean(String(payload?.semitransparency ?? "")),
    oob: decodeCatalogBoolean(String(payload?.oob ?? ""))
  };
  if (catalogSnapshotsEqual(previousSnapshot, nextSnapshot)) {
    setStatus(`No catalog changes to save for ${definition.shapeHex}.`);
    return;
  }

  setStatus(`Saving ${definition.shapeHex} to the ${state.current.selected.game} catalog...`);
  const result = await fetchJson(appUrl(getCatalogUpdatePath(state.current.selected.game, definition.shape)), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextSnapshot)
  });
  definition.catalogEntry = {
    ...definition.catalogEntry,
    ...result.entry
  };
  rebuildScene();
  syncTooltipState();
  setStatus(`Saved catalog entry for ${definition.displayName || definition.shapeHex}.`);
}

function buildTooltipMetadataRows(item, definition, surfaceType) {
  const dimensions = definition?.dimensions;
  const dimensionText = dimensions
    ? `${dimensions.x ?? "-"} × ${dimensions.y ?? "-"} × ${dimensions.z ?? "-"}`
    : "-";
  return `
    <dt>Shape</dt><dd>${escapeHtml(definition?.shapeHex ?? item.shapeDefId)} frame ${escapeHtml(item.frame)}</dd>
    <dt>Kind</dt><dd>${escapeHtml(item.kind)}</dd>
    <dt>World</dt><dd>${escapeHtml(`${item.world.x}, ${item.world.y}, ${item.world.z}`)}</dd>
    <dt>Dims</dt><dd>${escapeHtml(dimensionText)}</dd>
    <dt>3D Surface</dt><dd>${escapeHtml(formatCatalogSurfaceTypeLabel(surfaceType))}</dd>
    <dt>Sprite</dt><dd>${escapeHtml(item.spriteId)}</dd>
    <dt>Flags</dt><dd>${escapeHtml(item.flags.hex)}</dd>
  `;
}

function syncTooltipState() {
  if (!state.current || !overlayTooltip) {
    hideTooltipOverlay();
    return;
  }
  const activeItemId = pinnedItemId || hoveredItemId;
  if (!activeItemId) {
    hideTooltipOverlay();
    return;
  }
  const item = state.current.itemIndex.get(activeItemId) ?? null;
  const definition = item ? getItemDefinition(item) : null;
  if (!item || !definition) {
    hideTooltipOverlay();
    return;
  }

  const pinned = pinnedItemId === activeItemId;
  const surfaceType = getCatalogSurfaceType(definition);
  overlayTooltip.hidden = false;
  overlayTooltip.classList.toggle("is-pinned", pinned);
  overlayTooltip.classList.toggle("is-hover", !pinned);
  setTooltipState({
    visible: true,
    pinned,
    hover: !pinned,
    hidden: false,
    item,
    itemLabel: item.label,
    displayName: definition.displayName,
    displayDescription: definition.description,
    metadataRowsHtml: buildTooltipMetadataRows(item, definition, surfaceType),
    notesHtml: "",
    monsterSpawnerEditorHtml: "",
    showCatalogEditor: pinned && canEditCatalog(),
    showTeleportEggEditor: false,
    showPinnedActions: false,
    usecodeTarget: null,
    warpCommand: "",
    catalogEntry: definition.catalogEntry ?? null,
    eyeIconSvg: "",
    penIconSvg: "",
    onToggleHidden: null,
    onSaveCatalog: (payload) => saveCatalogEntry(item, payload),
    onEditEgg: null,
    onOpenUsecode: null,
    onCopyStableId: null,
    onCopyWarpCommand: null,
    onSaveMonsterSpawner: null
  });
  scheduleTooltipPosition();
}

function setHoveredItem(nextItemId) {
  if (pinnedItemId) {
    return;
  }
  if (hoveredItemId === nextItemId) {
    scheduleTooltipPosition();
    syncSelectionHighlight();
    return;
  }
  hoveredItemId = nextItemId;
  syncTooltipState();
  syncSelectionHighlight();
}

function togglePinnedItem(nextItemId) {
  pinnedItemId = pinnedItemId === nextItemId ? null : nextItemId;
  if (pinnedItemId) {
    hoveredItemId = null;
  }
  syncTooltipState();
  syncSelectionHighlight();
}

function pickItemAtClient(clientX, clientY) {
  if (!renderer || !camera || interactiveObjects.length === 0) {
    return null;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(interactiveObjects, false);
  const hit = hits.find((entry) => (
    entry.object?.userData?.itemId
    || Number.isInteger(entry.instanceId)
  ));
  if (!hit) {
    return null;
  }
  if (hit.object?.userData?.itemId) {
    return hit.object.userData.itemId;
  }
  const instanceItemIds = hit.object?.userData?.instanceItemIds;
  return Array.isArray(instanceItemIds) && Number.isInteger(hit.instanceId)
    ? instanceItemIds[hit.instanceId] ?? null
    : null;
}

function shouldRenderItem(item, definition) {
  if (!item || !definition) {
    return false;
  }
  if (state.current?.hiddenIds.has(item.id)) {
    return false;
  }
  if (includeRoofsCheckbox?.checked === false && definition.traits?.roof) {
    return false;
  }
  if (includeOobCheckbox?.checked === false && definition.traits?.oob) {
    return false;
  }
  return true;
}

function getDepthBias(item) {
  return (item.drawOrder % 29) * 0.003;
}

function isWireframeEnabled() {
  return showBoundingBoxesCheckbox?.checked === true;
}

function shouldKeepFallbackWireframe(surfaceType, rendered) {
  return !surfaceType && !rendered;
}

function shouldUseSurfaceTransparency(definition, sprite, atlasImage, itemOpacity) {
  if (itemOpacity < 0.999) {
    return true;
  }
  if (definition?.traits?.translucent || definition?.catalogEntry?.semitransparency === true) {
    return true;
  }
  const source = getSpriteSource(sprite, atlasImage);
  return Boolean(source?.hasPartialAlpha);
}

function syncSelectionHighlight() {
  if (!worldGroup) {
    return;
  }
  if (selectionHighlightMesh) {
    worldGroup.remove(selectionHighlightMesh);
    selectionHighlightMesh = null;
  }
  const activeItemId = pinnedItemId || hoveredItemId;
  if (!activeItemId) {
    requestRender();
    return;
  }
  const renderedItem = itemRenderIndex.get(activeItemId);
  if (!renderedItem) {
    requestRender();
    return;
  }
  const scale = 1.02;
  const geometry = getBoxGeometry(renderedItem.width * scale, renderedItem.height * scale, renderedItem.depth * scale);
  selectionHighlightMesh = new THREE.Mesh(
    geometry,
    getSelectionHighlightMaterial(Boolean(pinnedItemId && pinnedItemId === activeItemId))
  );
  selectionHighlightMesh.position.copy(renderedItem.position);
  selectionHighlightMesh.renderOrder = renderedItem.item.drawOrder * 2 + 3;
  worldGroup.add(selectionHighlightMesh);
  requestRender();
}

function queueWireframeInstance(batches, item, definition, width, height, depth, position, itemOpacity) {
  const cacheKey = `${width}:${height}:${depth}:${definition?.kind || item.kind}:${clamp(itemOpacity, 0.1, 1).toFixed(2)}`;
  let batch = batches.get(cacheKey);
  if (!batch) {
    batch = {
      geometry: getBoxGeometry(width, height, depth),
      material: getWireframeMaterial(definition?.kind || item.kind, itemOpacity),
      itemIds: [],
      positions: []
    };
    batches.set(cacheKey, batch);
  }
  batch.itemIds.push(item.id);
  batch.positions.push({ x: position.x, y: position.y, z: position.z });
}

function flushWireframeBatches(batches) {
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.itemIds.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.renderOrder = 1;
    mesh.userData = { instanceItemIds: batch.itemIds };
    for (let index = 0; index < batch.positions.length; index += 1) {
      const position = batch.positions[index];
      instanceMatrix.compose(new THREE.Vector3(position.x, position.y, position.z), identityQuaternion, unitScale);
      mesh.setMatrixAt(index, instanceMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    worldGroup.add(mesh);
    interactiveObjects.push(mesh);
  }
}

function addItemGeometry(item, definition, width, depth, height, minItemX, minItemY, minItemZ, wireframeBatches) {
  const geometry = getBoxGeometry(width, height, depth);
  const depthBias = getDepthBias(item);
  const position = new THREE.Vector3(minItemX + width / 2, minItemY + height / 2 + depthBias, minItemZ + depth / 2);
  const surfaceType = getCatalogSurfaceType(definition);
  const itemOpacity = item.presentation?.opacity ?? 1;
  const sprite = state.current?.spriteIndex.get(item.spriteId) ?? null;
  const atlasImage = sprite ? state.current?.atlasImages.get(sprite.atlasId) ?? null : null;
  const transparentSurface = sprite && atlasImage
    ? shouldUseSurfaceTransparency(definition, sprite, atlasImage, itemOpacity)
    : itemOpacity < 0.999;
  const sideHeightPixels = height / WORLD_VERTICAL_SCALE;
  let textured = false;

  try {
    if (surfaceType === "floor" && sprite && atlasImage) {
      const floorTexture = buildFloorTexture(sprite, atlasImage, width, depth, sideHeightPixels, Boolean(item.flags?.flipped));
      if (floorTexture) {
        const mesh = new THREE.Mesh(geometry, [
          getNeutralSurfaceMaterial(itemOpacity),
          getNeutralSurfaceMaterial(itemOpacity),
          createTexturedMaterial(floorTexture, itemOpacity, transparentSurface),
          getNeutralSurfaceMaterial(itemOpacity),
          getNeutralSurfaceMaterial(itemOpacity),
          getNeutralSurfaceMaterial(itemOpacity)
        ]);
        mesh.userData = { itemId: item.id };
        mesh.renderOrder = item.drawOrder * 2;
        mesh.position.copy(position);
        worldGroup.add(mesh);
        interactiveObjects.push(mesh);
        textured = true;
      }
    }

    if (!textured && surfaceType === "wall" && sprite && atlasImage) {
      const wallTextures = buildWallTextures(sprite, atlasImage, width, depth, height, Boolean(item.flags?.flipped));
      if (wallTextures?.front || wallTextures?.side || wallTextures?.top) {
        const frontMaterial = wallTextures.front
          ? createTexturedMaterial(wallTextures.front, itemOpacity, transparentSurface)
          : getNeutralSurfaceMaterial(itemOpacity);
        const sideMaterial = wallTextures.side
          ? createTexturedMaterial(wallTextures.side, itemOpacity, transparentSurface)
          : getNeutralSurfaceMaterial(itemOpacity);
        const topMaterial = wallTextures.top
          ? createTexturedMaterial(wallTextures.top, itemOpacity, transparentSurface)
          : getNeutralSurfaceMaterial(itemOpacity);
        const mesh = new THREE.Mesh(geometry, [
          sideMaterial,
          sideMaterial,
          topMaterial,
          getNeutralSurfaceMaterial(itemOpacity),
          frontMaterial,
          frontMaterial
        ]);
        mesh.userData = { itemId: item.id };
        mesh.renderOrder = item.drawOrder * 2;
        mesh.position.copy(position);
        worldGroup.add(mesh);
        interactiveObjects.push(mesh);
        textured = true;
      }
    }
  } catch (error) {
    const shapeLabel = definition?.shapeHex ?? item.shapeDefId;
    console.error("3D surface generation failed", { itemId: item.id, shape: shapeLabel, surfaceType, error });
    setStatus(`3D ${surfaceType || "surface"} generation failed for ${shapeLabel}; using wireframe fallback.`);
  }

  const wireframeVisible = isWireframeEnabled() || shouldKeepFallbackWireframe(surfaceType, textured);
  if (wireframeVisible) {
    queueWireframeInstance(wireframeBatches, item, definition, width, height, depth, position, itemOpacity);
  }

  itemRenderIndex.set(item.id, {
    item,
    definition,
    surfaceType,
    textured,
    wireframeVisible,
    width,
    height,
    depth,
    position: position.clone()
  });
  return { textured, wireframeVisible };
}

function rebuildScene() {
  if (!scene || !worldGroup) {
    return;
  }

  const nextRenderKey = getSceneRenderKey();
  const previousSelectionKey = currentRenderKey?.split(":").slice(0, 2).join(":") ?? null;
  const nextSelectionKey = nextRenderKey.split(":").slice(0, 2).join(":");
  const selectionChanged = previousSelectionKey !== nextSelectionKey;

  clearWorldGroup();
  disposeTextureCache();
  wireframeCount.value = 0;
  texturedCount.value = 0;

  if (!state.current) {
    currentRenderKey = nextRenderKey;
    pinnedItemId = null;
    hoveredItemId = null;
    hideTooltipOverlay();
    setStatus("Choose a PC map to inspect it in 3D.");
    return;
  }

  if (!isPcSceneSelected()) {
    currentRenderKey = nextRenderKey;
    pinnedItemId = null;
    hoveredItemId = null;
    hideTooltipOverlay();
    setStatus("The 3D surface viewer is only available for the DOS/PC scenes.");
    return;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minWorldZ = Number.POSITIVE_INFINITY;
  let maxWorldZ = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let visibleCount = 0;
  let texturedVisibleCount = 0;
  let wireframeVisibleCount = 0;
  const wireframeBatches = new Map();

  for (const item of state.current.scene.items) {
    const definition = getItemDefinition(item);
    const dimensions = definition?.dimensions;
    if (!dimensions || !item?.world || !shouldRenderItem(item, definition)) {
      continue;
    }

    const flipped = Boolean(item.flags?.flipped);
    const width = Math.max(1, (flipped ? dimensions.y : dimensions.x) * 32);
    const depth = Math.max(1, (flipped ? dimensions.x : dimensions.y) * 32);
    const height = Math.max(8, dimensions.z * 8 * WORLD_VERTICAL_SCALE);
    const minItemX = -item.world.x;
    const maxItemX = -(item.world.x - width);
    const minItemZ = -item.world.y;
    const maxItemZ = -(item.world.y - depth);
    const minItemY = item.world.z * WORLD_VERTICAL_SCALE;
    const maxItemY = minItemY + height;

    minX = Math.min(minX, minItemX);
    maxX = Math.max(maxX, maxItemX);
    minWorldZ = Math.min(minWorldZ, minItemZ);
    maxWorldZ = Math.max(maxWorldZ, maxItemZ);
    minY = Math.min(minY, minItemY);
    maxY = Math.max(maxY, maxItemY);

    const geometryResult = addItemGeometry(item, definition, width, depth, height, minItemX, minItemY, minItemZ, wireframeBatches);
    if (geometryResult.textured) {
      texturedVisibleCount += 1;
    }
    if (geometryResult.wireframeVisible) {
      wireframeVisibleCount += 1;
    }
    visibleCount += 1;
  }

  flushWireframeBatches(wireframeBatches);

  currentRenderKey = nextRenderKey;
  wireframeCount.value = wireframeVisibleCount;
  texturedCount.value = texturedVisibleCount;
  updateRendererQuality(wireframeVisibleCount, texturedVisibleCount);

  if (!visibleCount) {
    sceneMetrics.largestSpan = 512;
    sceneMetrics.height = 128;
    pinnedItemId = null;
    hoveredItemId = null;
    hideTooltipOverlay();
    setStatus("Current PC scene has no visible shapes with 3D bounds.");
    resetCamera(selectionChanged);
    return;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minWorldZ + maxWorldZ) / 2;
  worldGroup.position.set(-centerX, -minY, -centerZ);

  sceneMetrics.largestSpan = Math.max(maxX - minX, maxWorldZ - minWorldZ, 512);
  sceneMetrics.height = Math.max(maxY - minY, 96);

  if (camera) {
    camera.near = 4;
    camera.far = Math.max(8192, sceneMetrics.largestSpan * 10 + sceneMetrics.height * 8);
    camera.updateProjectionMatrix();
  }

  gridHelper = createGrid(sceneMetrics.largestSpan);
  scene.add(gridHelper);

  if (pinnedItemId && !itemRenderIndex.has(pinnedItemId)) {
    pinnedItemId = null;
  }
  if (hoveredItemId && !itemRenderIndex.has(hoveredItemId)) {
    hoveredItemId = null;
  }

  resetCamera(selectionChanged);
  syncTooltipState();
  syncSelectionHighlight();
  setStatus(`Viewing ${state.current.selected.game} map ${state.current.selected.mapId} with ${texturedVisibleCount} textured surfaces and ${wireframeVisibleCount} wireframe-visible shapes.`);
  requestRender();
}

function resizeRenderer() {
  if (!renderer || !camera || !host.value) {
    return;
  }
  const width = Math.max(1, Math.floor(host.value.clientWidth));
  const height = Math.max(1, Math.floor(host.value.clientHeight));
  renderer.setSize(width, height, true);
  renderer.setViewport(0, 0, width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  scheduleTooltipPosition();
  requestRender();
}

function applyLookDelta(deltaX, deltaY) {
  lookState.yaw -= deltaX * 0.0024;
  lookState.pitch = THREE.MathUtils.clamp(lookState.pitch - deltaY * 0.0018, -1.45, 1.45);
  applyCameraLook();
}

function updateMovement(deltaSeconds) {
  if (!camera || pressedKeys.size === 0) {
    return false;
  }
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const velocity = new THREE.Vector3();

  if (pressedKeys.has("KeyW")) {
    velocity.add(forward);
  }
  if (pressedKeys.has("KeyS")) {
    velocity.sub(forward);
  }
  if (pressedKeys.has("KeyD")) {
    velocity.add(right);
  }
  if (pressedKeys.has("KeyA")) {
    velocity.sub(right);
  }
  if (pressedKeys.has("Space")) {
    velocity.y += 1;
  }
  if (pressedKeys.has("KeyC")) {
    velocity.y -= 1;
  }

  if (velocity.lengthSq() === 0) {
    return false;
  }

  const speed = Math.max(128, Math.min(3072, sceneMetrics.largestSpan * 0.45)) * (pressedKeys.has("ShiftLeft") ? 2 : 1);
  camera.position.addScaledVector(velocity.normalize(), speed * deltaSeconds);
  applyCameraLook();
  return true;
}

function animate(timestamp) {
  animationFrame = window.requestAnimationFrame(animate);
  const deltaSeconds = Math.min(0.05, lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 0.016);
  lastFrameTime = timestamp;

  const nextRenderKey = getSceneRenderKey();
  if (nextRenderKey !== currentRenderKey) {
    rebuildScene();
  }

  const moved = updateMovement(deltaSeconds);
  if (moved || needsRender) {
    renderer?.render(scene, camera);
    needsRender = false;
  }
}

function handleCanvasPointerMove(event) {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  lastPointer.active = true;

  if (dragState.active && event.pointerId === dragState.pointerId) {
    const deltaX = event.clientX - dragState.lastX;
    const deltaY = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragState.moved = true;
    }
    dragLooking.value = true;
    applyLookDelta(deltaX, deltaY);
    return;
  }

  setHoveredItem(pickItemAtClient(event.clientX, event.clientY));
}

function handleKeyDown(event) {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "Space", "ShiftLeft"].includes(event.code)) {
    event.preventDefault();
    pressedKeys.add(event.code);
  }
}

function handleKeyUp(event) {
  pressedKeys.delete(event.code);
}

function stopDragLook() {
  dragState.active = false;
  dragState.pointerId = null;
  dragState.moved = false;
  dragLooking.value = false;
}

function handleWindowBlur() {
  pressedKeys.clear();
  stopDragLook();
  lastPointer.active = false;
}

function handlePointerDown(event) {
  if (event.button !== 0 || !host.value) {
    return;
  }
  host.value.focus();
  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
  dragState.moved = false;
  dragLooking.value = false;
}

function handlePointerUp(event) {
  if (event.pointerId === dragState.pointerId) {
    suppressNextClick = dragState.moved;
    stopDragLook();
  }
}

function handlePointerCancel(event) {
  if (event.pointerId === dragState.pointerId) {
    stopDragLook();
  }
}

function handlePointerLeave(event) {
  if (event.pointerId === dragState.pointerId) {
    stopDragLook();
  }
  if (!pinnedItemId) {
    hoveredItemId = null;
    hideTooltipOverlay();
  }
}

function handleCanvasClick(event) {
  if (event.button !== 0 || suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  host.value?.focus();
  setHoveredItem(pickItemAtClient(event.clientX, event.clientY));
}

function handleContextMenu(event) {
  event.preventDefault();
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  lastPointer.active = true;
  togglePinnedItem(pickItemAtClient(event.clientX, event.clientY));
}

function initializeRenderer() {
  if (!host.value || renderer) {
    return;
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  currentPixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(currentPixelRatio);
  renderer.setClearColor(0x081018, 1);
  host.value.append(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 4, 100000);
  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  resizeObserver = new ResizeObserver(() => resizeRenderer());
  resizeObserver.observe(host.value);

  renderer.domElement.addEventListener("click", handleCanvasClick);
  renderer.domElement.addEventListener("contextmenu", handleContextMenu);
  renderer.domElement.addEventListener("pointermove", handleCanvasPointerMove);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("resize", resizeRenderer);

  resizeRenderer();
  rebuildScene();
  animationFrame = window.requestAnimationFrame(animate);
}

function disposeRenderer() {
  window.cancelAnimationFrame(animationFrame);
  window.cancelAnimationFrame(tooltipLayoutFrame);
  animationFrame = 0;
  tooltipLayoutFrame = 0;
  lastFrameTime = 0;
  needsRender = true;
  pressedKeys.clear();
  stopDragLook();
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("resize", resizeRenderer);

  resizeObserver?.disconnect();
  resizeObserver = null;

  if (renderer?.domElement) {
    renderer.domElement.removeEventListener("click", handleCanvasClick);
    renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
    renderer.domElement.removeEventListener("pointermove", handleCanvasPointerMove);
    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
  }

  clearWorldGroup();
  disposeTextureCache();

  for (const geometry of edgeGeometryCache.values()) {
    geometry.dispose();
  }
  edgeGeometryCache.clear();

  for (const geometry of boxGeometryCache.values()) {
    geometry.dispose();
  }
  boxGeometryCache.clear();

  for (const material of materialCache.values()) {
    material.dispose();
  }
  materialCache.clear();

  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  worldGroup = null;
  currentRenderKey = null;
  suppressNextClick = false;
  hoveredItemId = null;
  pinnedItemId = null;
  dragLooking.value = false;
  hideTooltipOverlay();
}

onMounted(() => {
  try {
    initializeRenderer();
  } catch (error) {
    console.error("3D surface viewer initialization failed", error);
    setStatus("WebGL could not be initialized in this browser session.");
  }
});

onBeforeUnmount(() => {
  disposeRenderer();
});
</script>

<style scoped>
.wireframe-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: 20px;
  background:
    radial-gradient(circle at top, rgba(74, 141, 171, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(5, 10, 16, 0.96) 0%, rgba(8, 17, 26, 0.98) 100%);
  border: 1px solid rgba(121, 176, 209, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.wireframe-host {
  height: 100%;
  min-height: 0;
  cursor: crosshair;
}

.wireframe-host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.wireframe-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  display: grid;
  gap: 6px;
  max-width: min(480px, calc(100% - 32px));
  pointer-events: none;
}

.wireframe-badge,
.wireframe-status,
.wireframe-help,
.wireframe-count {
  width: fit-content;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(7, 17, 26, 0.76);
  color: rgba(232, 242, 250, 0.96);
  border: 1px solid rgba(121, 176, 209, 0.2);
  backdrop-filter: blur(12px);
}

.wireframe-badge {
  font-weight: 800;
  letter-spacing: 0.08em;
}

.wireframe-status,
.wireframe-help {
  border-radius: 14px;
  line-height: 1.45;
}

.wireframe-count {
  font-weight: 700;
}

@media (max-width: 720px) {
  .wireframe-overlay {
    top: 12px;
    left: 12px;
    max-width: calc(100% - 24px);
  }
}
</style>