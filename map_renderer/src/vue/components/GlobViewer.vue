<template>
  <div class="glob-viewer">
    <header class="glob-viewer-toolbar">
      <div class="glob-toolbar-summary">
        <h1>Glob Viewer</h1>
        <span>{{ toolbarMeta }}</span>
      </div>
      <div class="glob-toolbar-actions" role="toolbar" aria-label="Glob preview controls">
        <button class="glob-toolbar-button" type="button" aria-label="Zoom out" :disabled="!hasPreview" @click="adjustZoom(-1)">-</button>
        <button class="glob-toolbar-button glob-zoom-value" type="button" aria-label="Reset zoom" :disabled="!hasPreview" @click="resetZoom">{{ Math.round(zoom * 100) }}%</button>
        <button class="glob-toolbar-button" type="button" aria-label="Zoom in" :disabled="!hasPreview" @click="adjustZoom(1)">+</button>
        <button class="glob-toolbar-button" type="button" :disabled="!hasPreview" @click="fitLayout">Fit</button>
      </div>
    </header>

    <div class="glob-viewer-content">
      <aside class="glob-sidebar" aria-label="Glob archive browser">
        <div class="glob-list-controls">
          <label for="glob-search">Glob entries</label>
          <input id="glob-search" v-model.trim="searchQuery" type="search" placeholder="Search index, shape, or frame">
          <span class="glob-list-count" role="status">{{ filteredGlobs.length }} of {{ globEntries.length }}</span>
        </div>

        <div ref="globEntryList" class="glob-entry-list" role="listbox" aria-label="Glob entries" @scroll="handleGlobListScroll">
          <div v-if="filteredGlobs.length" class="glob-entry-spacer" :style="{ height: `${globEntryWindow.totalHeight}px` }">
            <button
              v-for="row in virtualGlobEntries"
              :key="row.entry.index"
              :style="{ top: `${row.top}px` }"
              :class="['glob-entry-option', { 'is-selected': selectedGlobIndex === row.entry.index }]"
              type="button"
              role="option"
              :aria-selected="selectedGlobIndex === row.entry.index"
              @click="selectGlob(row.entry.index)"
            >
              <canvas :ref="getGlobEntryPreviewRef(row.entry.index)" class="glob-entry-preview" aria-hidden="true"></canvas>
              <span class="glob-entry-copy">
                <span class="glob-entry-name">Glob {{ formatGlobIndex(row.entry.index) }}</span>
                <span class="glob-entry-meta">{{ row.entry.children.length }} child{{ row.entry.children.length === 1 ? '' : 'ren' }} · {{ row.entry.maps.length }} map{{ row.entry.maps.length === 1 ? '' : 's' }}</span>
              </span>
            </button>
          </div>
          <p v-else-if="!surfaceMessage" class="glob-list-empty">No matching globs.</p>
        </div>

        <section class="glob-usage-panel" aria-labelledby="glob-usage-title">
          <div class="glob-usage-heading">
            <h2 id="glob-usage-title">Maps used</h2>
            <span>{{ selectedGlob?.maps.length ?? 0 }}</span>
          </div>
          <div class="glob-map-list">
            <button
              v-for="mapId in selectedGlob?.maps ?? []"
              :key="mapId"
              class="glob-map-entry"
              type="button"
              :aria-label="`Open map ${mapId} and focus glob ${formatGlobIndex(selectedGlob.index)}`"
              @click="openMapAtGlob(mapId)"
            >Map {{ mapId }}</button>
            <span v-if="selectedGlob && selectedGlob.maps.length === 0" class="glob-map-empty">Not referenced by detected maps.</span>
            <span v-if="!selectedGlob" class="glob-map-empty">Select a glob.</span>
          </div>
        </section>
      </aside>

      <main class="glob-preview-panel">
        <div class="glob-preview-heading">
          <div class="glob-preview-title-group">
            <h2>{{ selectedGlob ? `Glob ${formatGlobIndex(selectedGlob.index)}` : 'Glob preview' }}</h2>
            <span v-if="selectedGlob">{{ selectedGlob.children.length }} child descriptor{{ selectedGlob.children.length === 1 ? '' : 's' }}</span>
          </div>
        </div>

        <div
          ref="viewport"
          class="glob-preview-viewport"
          :class="{ 'is-dragging': Boolean(dragState) }"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerUp"
          @pointerleave="handlePointerLeave"
          @wheel.prevent="handleWheel"
        >
          <canvas ref="canvas" class="glob-preview-canvas" aria-label="Selected glob preview"></canvas>
          <div v-if="surfaceMessage" class="glob-preview-empty">{{ surfaceMessage }}</div>
          <div v-else-if="selectedGlob && selectedGlob.children.length === 0" class="glob-preview-empty">This glob has no child descriptors.</div>
        </div>

        <section class="glob-information" aria-label="Selected glob and shape information">
          <dl v-if="selectedGlob" class="glob-record-details">
            <dt>GLOB index</dt>
            <dd>{{ selectedGlob.index }} ({{ formatGlobIndex(selectedGlob.index) }})</dd>
            <dt>Children</dt>
            <dd>{{ selectedGlob.children.length }}</dd>
            <dt>Maps used</dt>
            <dd>{{ selectedGlob.maps.length }}</dd>
          </dl>
          <div v-if="focusedChild" class="glob-shape-details">
            <div class="glob-shape-heading">
              <h3>{{ focusedChild.displayName }}</h3>
              <span>{{ formatShapeCode(focusedChild.child.shape) }} · frame {{ focusedChild.child.frame }}</span>
            </div>
            <dl class="glob-shape-fields">
              <dt>Shape</dt><dd>{{ formatShapeCode(focusedChild.child.shape) }}</dd>
              <dt>Frame</dt><dd>{{ focusedChild.child.frame }}</dd>
              <dt>Atlas</dt><dd>{{ focusedChild.atlas?.id ?? 'Unavailable' }}</dd>
              <dt>Sprite</dt><dd>{{ focusedChild.sprite ? `${focusedChild.sprite.width} x ${focusedChild.sprite.height}` : 'Unavailable' }}</dd>
              <dt>Atlas position</dt><dd>{{ focusedChild.sprite ? `${focusedChild.sprite.x}, ${focusedChild.sprite.y}` : '-' }}</dd>
              <dt>Family</dt><dd>{{ formatFamilyLabel(focusedChild.definition?.family) }}</dd>
              <dt>Kind</dt><dd>{{ focusedChild.definition?.kind ?? '-' }}</dd>
              <dt>Dimensions</dt><dd>{{ formatDimensions(focusedChild.definition?.dimensions) }}</dd>
              <dt>Traits</dt><dd>{{ formatTraits(focusedChild.definition?.traits) }}</dd>
              <dt>Glob offset</dt><dd>{{ focusedChild.child.x }}, {{ focusedChild.child.y }}, {{ focusedChild.child.z }}</dd>
            </dl>
            <p v-if="focusedChild.displayDescription" class="glob-shape-description">{{ focusedChild.displayDescription }}</p>
          </div>
          <div v-else-if="selectedGlob" class="glob-no-child-selection">{{ selectedGlob.children.length ? 'No child selected' : 'No child shape details' }}</div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { appUrl, fetchJson } from "../../public/helpers.js";
import { loadImage } from "../../public/scene-api.js";
import { getReferenceAtlasPath, getReferenceDataPath } from "../../shared/runtime-adapter.js";
import { getGlobListWindow } from "../../lib/glob-viewer-data.js";
import { mapWorldToScenePoint } from "../controller/map-editor-geometry.js";
import { DEVICE_PIXEL_RATIO, state } from "../controller/state.js";

const SCENE_CHANGED_EVENT = "crusader-map-renderer:scene-changed";
const REQUEST_MAP_GLOB_EVENT = "crusader-map-renderer:request-map-glob";
const OPEN_GLOB_EVENT = "crusader-map-renderer:open-glob-entry";
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 12;
const ZOOM_FACTOR = 1.2;
const PREVIEW_PADDING = 40;
const GLOB_LIST_ROW_HEIGHT = 56;

const viewport = ref(null);
const canvas = ref(null);
const globEntryList = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const currentGameId = ref("");
const currentReferenceId = ref("");
const referenceData = ref(null);
const globEntries = ref([]);
const atlasImages = ref(new Map());
const selectedGlobIndex = ref(null);
const selectedChildIndex = ref(null);
const hoveredChildIndex = ref(null);
const searchQuery = ref("");
const globListScrollTop = ref(0);
const globListViewportHeight = ref(0);
const zoom = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const dragState = ref(null);

const referenceDataCache = new Map();
const imageCache = new Map();
const globSearchTextByIndex = new Map();
let renderFrame = 0;
let loadToken = 0;
let needsFit = true;
let globListResizeObserver = null;
let pendingOpenGlobIndex = null;
const globEntryPreviewCanvases = new Map();
const globEntryPreviewRefs = new Map();

const currentGameLabel = computed(() => (
  state.catalog?.games?.find((game) => game.id === currentGameId.value)?.label ?? currentGameId.value
));
const selectedGlob = computed(() => globEntries.value.find((entry) => entry.index === selectedGlobIndex.value) ?? null);
const filteredGlobs = computed(() => {
  const query = searchQuery.value.toLowerCase();
  if (!query) {
    return globEntries.value;
  }
  return globEntries.value.filter((entry) => globSearchTextByIndex.get(entry.index)?.includes(query));
});
const globEntryWindow = computed(() => getGlobListWindow(
  filteredGlobs.value.length,
  globListScrollTop.value,
  globListViewportHeight.value,
  GLOB_LIST_ROW_HEIGHT
));
const virtualGlobEntries = computed(() => filteredGlobs.value
  .slice(globEntryWindow.value.start, globEntryWindow.value.end)
  .map((entry, index) => ({
    entry,
    top: (globEntryWindow.value.start + index) * GLOB_LIST_ROW_HEIGHT
  })));
const referenceAtlases = computed(() => referenceData.value?.atlases ?? []);
const spriteIndex = computed(() => new Map((referenceData.value?.sprites ?? []).map((sprite) => [sprite.id, sprite])));
const definitionIndex = computed(() => new Map((referenceData.value?.shapeDefinitions ?? []).map((definition) => [definition.id, definition])));
const outlineCache = new Map();
const surfaceMessage = computed(() => {
  if (loading.value) {
    return `Loading globs for ${currentGameLabel.value || 'the current game'}...`;
  }
  if (errorMessage.value) {
    return errorMessage.value;
  }
  if (!currentGameId.value) {
    return "Load a map to browse its game's GLOB archive.";
  }
  if (!globEntries.value.length) {
    return "No glob catalog is available for this game.";
  }
  return "";
});
const toolbarMeta = computed(() => {
  if (loading.value) {
    return `Loading ${currentGameLabel.value || 'game'} glob catalog...`;
  }
  if (errorMessage.value) {
    return errorMessage.value;
  }
  if (!currentGameId.value) {
    return "Select a map to load its game's globs.";
  }
  return `${currentGameLabel.value} · ${globEntries.value.length} glob entries`;
});
const previewItems = computed(() => {
  const children = selectedGlob.value?.children ?? [];
  const sprites = spriteIndex.value;
  const items = children.map((child) => {
    const sprite = sprites.get(child.spriteId) ?? null;
    const width = sprite?.width ?? 32;
    const height = sprite?.height ?? 32;
    const anchor = mapWorldToScenePoint({ x: child.x * 4 + 2, y: child.y * 4 + 2, z: child.z });
    const left = anchor.x - (sprite?.xoff ?? width / 2);
    const top = anchor.y - (sprite?.yoff ?? height);
    return {
      child,
      sprite,
      left,
      top,
      width,
      height,
      anchorX: anchor.x,
      anchorY: anchor.y,
      boundingSegments: getShapeBoundingSegments(child)
    };
  }).sort((left, right) => left.child.renderOrder - right.child.renderOrder || left.child.childIndex - right.child.childIndex);
  if (!items.length) {
    return { items, width: 0, height: 0 };
  }
  const boundingPoints = items.flatMap((item) => item.boundingSegments.flat());
  const minX = Math.min(...items.map((item) => item.left), ...boundingPoints.map((point) => point.x));
  const minY = Math.min(...items.map((item) => item.top), ...boundingPoints.map((point) => point.y));
  const maxX = Math.max(...items.map((item) => item.left + item.width), ...boundingPoints.map((point) => point.x));
  const maxY = Math.max(...items.map((item) => item.top + item.height), ...boundingPoints.map((point) => point.y));
  return {
    items: items.map((item) => ({
      ...item,
      left: item.left - minX + PREVIEW_PADDING,
      top: item.top - minY + PREVIEW_PADDING,
      boundingSegments: item.boundingSegments.map((segment) => segment.map((point) => ({
        x: point.x - minX + PREVIEW_PADDING,
        y: point.y - minY + PREVIEW_PADDING
      })))
    })),
    width: maxX - minX + PREVIEW_PADDING * 2,
    height: maxY - minY + PREVIEW_PADDING * 2
  };
});
const focusedChild = computed(() => {
  const childIndex = selectedChildIndex.value ?? hoveredChildIndex.value;
  const child = selectedGlob.value?.children.find((entry) => entry.childIndex === childIndex) ?? null;
  if (!child) {
    return null;
  }
  const sprite = spriteIndex.value.get(child.spriteId) ?? null;
  const definition = definitionIndex.value.get(`shape:${child.shape}`) ?? null;
  return {
    child,
    sprite,
    definition,
    atlas: referenceAtlases.value.find((entry) => entry.id === sprite?.atlasId) ?? null,
    displayName: getShapeDisplayName(definition, child.shape),
    displayDescription: String(definition?.catalogEntry?.description ?? definition?.description ?? "").trim()
  };
});
const hasPreview = computed(() => previewItems.value.items.length > 0);

function formatGlobIndex(index) {
  return `0x${Number(index).toString(16).padStart(4, "0")}`;
}

function getGlobEntryPreviewRef(index) {
  if (!globEntryPreviewRefs.has(index)) {
    globEntryPreviewRefs.set(index, (element) => {
      if (!element) {
        globEntryPreviewCanvases.delete(index);
        return;
      }
      globEntryPreviewCanvases.set(index, element);
      drawGlobEntryPreview(element, index);
    });
  }
  return globEntryPreviewRefs.get(index);
}

function drawGlobEntryPreview(element, index) {
  const previewSize = 40;
  const pixelRatio = DEVICE_PIXEL_RATIO;
  const width = Math.round(previewSize * pixelRatio);
  const height = Math.round(previewSize * pixelRatio);
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  const context = element.getContext("2d", { alpha: true });
  const entry = globEntries.value.find((candidate) => candidate.index === index);
  if (!context || !entry) {
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, previewSize, previewSize);
  context.imageSmoothingEnabled = false;

  const items = entry.children.map((child) => {
    const sprite = spriteIndex.value.get(child.spriteId);
    const atlas = sprite ? atlasImages.value.get(sprite.atlasId) : null;
    if (!sprite || !atlas) {
      return null;
    }
    const anchor = mapWorldToScenePoint({ x: child.x * 4 + 2, y: child.y * 4 + 2, z: child.z });
    return {
      sprite,
      atlas,
      left: anchor.x - sprite.xoff,
      top: anchor.y - sprite.yoff,
      width: sprite.width,
      height: sprite.height
    };
  }).filter(Boolean);
  if (!items.length) {
    return;
  }

  const minX = Math.min(...items.map((item) => item.left));
  const minY = Math.min(...items.map((item) => item.top));
  const maxX = Math.max(...items.map((item) => item.left + item.width));
  const maxY = Math.max(...items.map((item) => item.top + item.height));
  const scale = Math.min((previewSize - 6) / Math.max(maxX - minX, 1), (previewSize - 6) / Math.max(maxY - minY, 1));
  const offsetX = (previewSize - (maxX - minX) * scale) / 2;
  const offsetY = (previewSize - (maxY - minY) * scale) / 2;
  for (const item of items) {
    context.drawImage(
      item.atlas,
      item.sprite.x,
      item.sprite.y,
      item.sprite.width,
      item.sprite.height,
      offsetX + (item.left - minX) * scale,
      offsetY + (item.top - minY) * scale,
      item.width * scale,
      item.height * scale
    );
  }
}

function redrawGlobEntryPreviews() {
  for (const [index, element] of globEntryPreviewCanvases) {
    drawGlobEntryPreview(element, index);
  }
}

function updateGlobListViewport() {
  const element = globEntryList.value;
  globListViewportHeight.value = element?.clientHeight ?? 0;
  globListScrollTop.value = element?.scrollTop ?? 0;
}

function handleGlobListScroll(event) {
  globListScrollTop.value = event.currentTarget.scrollTop;
}

function formatShapeCode(shape) {
  return `0x${Number(shape).toString(16).padStart(4, "0")}`;
}

function formatFamilyLabel(family) {
  if (!Number.isInteger(family)) {
    return "Unknown";
  }
  const labels = {
    1: "Crus-type NPC lane",
    3: "Glob egg",
    4: "Usecode trigger egg",
    6: "Non-Crus NPC lane",
    7: "Monster spawn egg",
    8: "Teleport egg",
    13: "Inventory item"
  };
  return labels[family] ?? `Family ${family}`;
}

function formatDimensions(dimensions) {
  return dimensions ? `${dimensions.x ?? '-'} x ${dimensions.y ?? '-'} x ${dimensions.z ?? '-'}` : "-";
}

function formatTraits(traits) {
  if (!traits) {
    return "-";
  }
  return Object.entries(traits).filter(([, enabled]) => enabled).map(([name]) => name).join(", ") || "-";
}

function getShapeDisplayName(definition, shape) {
  return String(definition?.catalogEntry?.humanReadableId ?? "").trim()
    || definition?.displayName
    || definition?.shapeHex
    || formatShapeCode(shape);
}

function getShapeBoundingSegments(child) {
  const dimensions = definitionIndex.value.get(`shape:${child.shape}`)?.dimensions;
  if (!dimensions) {
    return [];
  }
  const x = child.x * 4 + 2;
  const y = child.y * 4 + 2;
  const z = child.z;
  const xLeft = x - dimensions.x * 32;
  const yFar = y - dimensions.y * 32;
  const zTop = z + dimensions.z * 8;
  const sxLeft = Math.trunc(xLeft / 4 - y / 4);
  const sxRight = Math.trunc(x / 4 - yFar / 4);
  const sxTop = Math.trunc(xLeft / 4 - yFar / 4);
  const syTop = Math.trunc(xLeft / 8 + yFar / 8 - zTop);
  const sxBottom = Math.trunc(x / 4 - y / 4);
  const syBottom = Math.trunc(x / 8 + y / 8 - z);
  const syLeftTop = Math.trunc(xLeft / 8 + y / 8 - zTop);
  const syRightTop = Math.trunc(x / 8 + yFar / 8 - zTop);
  const syNearTop = Math.trunc(x / 8 + y / 8 - zTop);
  const point = (pointX, pointY) => ({ x: pointX, y: pointY });
  const segments = [
    [point(sxTop, syTop), point(sxLeft, syLeftTop)],
    [point(sxTop, syTop), point(sxRight, syRightTop)],
    [point(sxBottom, syNearTop), point(sxLeft, syLeftTop)],
    [point(sxBottom, syNearTop), point(sxRight, syRightTop)]
  ];

  if (z < zTop) {
    const syLeftBottom = Math.trunc(xLeft / 8 + y / 8 - z);
    const syRightBottom = Math.trunc(x / 8 + yFar / 8 - z);
    const leftBottom = point(sxLeft, syLeftBottom);
    const rightBottom = point(sxRight, syRightBottom);
    const nearBottom = point(sxBottom, syBottom);
    segments.push(
      [point(sxLeft, syLeftTop), leftBottom],
      [point(sxRight, syRightTop), rightBottom],
      [point(sxBottom, syNearTop), nearBottom],
      [leftBottom, nearBottom],
      [rightBottom, nearBottom]
    );
  }
  return segments;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function resizeCanvas() {
  if (!canvas.value || !viewport.value) {
    return;
  }
  const width = Math.max(1, Math.round(viewport.value.clientWidth * DEVICE_PIXEL_RATIO));
  const height = Math.max(1, Math.round(viewport.value.clientHeight * DEVICE_PIXEL_RATIO));
  if (canvas.value.width !== width || canvas.value.height !== height) {
    canvas.value.width = width;
    canvas.value.height = height;
  }
}

function getSpriteOutline(item, color) {
  const atlasImage = item.sprite ? atlasImages.value.get(item.sprite.atlasId) : null;
  if (!atlasImage || !item.sprite) {
    return null;
  }
  const cacheKey = `${currentReferenceId.value}:${item.sprite.id}:${color}`;
  if (outlineCache.has(cacheKey)) {
    return outlineCache.get(cacheKey);
  }

  const padding = 1;
  const outline = document.createElement("canvas");
  outline.width = item.sprite.width + padding * 2;
  outline.height = item.sprite.height + padding * 2;
  const outlineContext = outline.getContext("2d");
  if (!outlineContext) {
    return null;
  }
  outlineContext.imageSmoothingEnabled = false;
  const source = [atlasImage, item.sprite.x, item.sprite.y, item.sprite.width, item.sprite.height];
  outlineContext.drawImage(...source, padding, padding, item.sprite.width, item.sprite.height);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }
      outlineContext.drawImage(...source, padding + offsetX, padding + offsetY, item.sprite.width, item.sprite.height);
    }
  }
  outlineContext.globalCompositeOperation = "destination-out";
  outlineContext.drawImage(...source, padding, padding, item.sprite.width, item.sprite.height);
  outlineContext.globalCompositeOperation = "source-in";
  outlineContext.fillStyle = color;
  outlineContext.fillRect(0, 0, outline.width, outline.height);
  outlineContext.globalCompositeOperation = "source-over";

  outlineCache.set(cacheKey, outline);
  if (outlineCache.size > 512) {
    outlineCache.delete(outlineCache.keys().next().value);
  }
  return outline;
}

function draw() {
  renderFrame = 0;
  if (!canvas.value || !viewport.value || !viewport.value.clientWidth || !viewport.value.clientHeight) {
    return;
  }
  resizeCanvas();
  const context = canvas.value.getContext("2d", { alpha: true });
  if (!context) {
    return;
  }
  context.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
  context.clearRect(0, 0, viewport.value.clientWidth, viewport.value.clientHeight);
  context.fillStyle = "#0a0c12";
  context.fillRect(0, 0, viewport.value.clientWidth, viewport.value.clientHeight);
  context.save();
  context.translate(offsetX.value, offsetY.value);
  context.scale(zoom.value, zoom.value);

  for (const item of previewItems.value.items) {
    const atlasImage = item.sprite ? atlasImages.value.get(item.sprite.atlasId) : null;
    if (atlasImage && item.sprite) {
      context.drawImage(
        atlasImage,
        item.sprite.x,
        item.sprite.y,
        item.sprite.width,
        item.sprite.height,
        item.left,
        item.top,
        item.width,
        item.height
      );
    } else {
      context.fillStyle = "rgba(224, 120, 92, 0.22)";
      context.fillRect(item.left, item.top, item.width, item.height);
    }
  }

  for (const item of previewItems.value.items) {
    const selected = selectedChildIndex.value === item.child.childIndex;
    const hovered = hoveredChildIndex.value === item.child.childIndex && !selected;
    if (selected || hovered) {
      const color = selected ? "#7cb6d6" : "#ffe56b";
      const outline = getSpriteOutline(item, color);
      if (outline) {
        context.drawImage(outline, item.left - 1, item.top - 1, item.width + 2, item.height + 2);
      }
      context.lineWidth = Math.max(1.5 / zoom.value, 1);
      context.strokeStyle = color;
      context.beginPath();
      for (const [start, end] of item.boundingSegments) {
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      }
      context.stroke();
    }
  }

  context.restore();
}

function scheduleRender() {
  if (!renderFrame) {
    renderFrame = window.requestAnimationFrame(draw);
  }
}

function fitLayout() {
  if (!viewport.value || !hasPreview.value) {
    return;
  }
  if (!viewport.value.clientWidth || !viewport.value.clientHeight) {
    needsFit = true;
    return;
  }
  const availableWidth = Math.max(viewport.value.clientWidth - 48, 1);
  const availableHeight = Math.max(viewport.value.clientHeight - 48, 1);
  zoom.value = clampZoom(Math.min(availableWidth / previewItems.value.width, availableHeight / previewItems.value.height));
  offsetX.value = Math.round((viewport.value.clientWidth - previewItems.value.width * zoom.value) / 2);
  offsetY.value = Math.round((viewport.value.clientHeight - previewItems.value.height * zoom.value) / 2);
  needsFit = false;
  scheduleRender();
}

function resetZoom() {
  if (!viewport.value || !hasPreview.value) {
    return;
  }
  zoom.value = 1;
  offsetX.value = Math.round((viewport.value.clientWidth - previewItems.value.width) / 2);
  offsetY.value = Math.round((viewport.value.clientHeight - previewItems.value.height) / 2);
  scheduleRender();
}

function zoomAroundPoint(clientX, clientY, factor) {
  const rect = viewport.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }
  const pointX = (clientX - rect.left - offsetX.value) / zoom.value;
  const pointY = (clientY - rect.top - offsetY.value) / zoom.value;
  zoom.value = clampZoom(zoom.value * factor);
  offsetX.value = clientX - rect.left - pointX * zoom.value;
  offsetY.value = clientY - rect.top - pointY * zoom.value;
  scheduleRender();
}

function adjustZoom(direction) {
  const rect = viewport.value?.getBoundingClientRect();
  if (rect) {
    zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR);
  }
}

function scenePointFromClient(clientX, clientY) {
  const rect = viewport.value?.getBoundingClientRect();
  return rect ? {
    x: (clientX - rect.left - offsetX.value) / zoom.value,
    y: (clientY - rect.top - offsetY.value) / zoom.value
  } : null;
}

function findChildAtPoint(point) {
  if (!point) {
    return null;
  }
  for (const item of [...previewItems.value.items].reverse()) {
    if (point.x >= item.left && point.x < item.left + item.width && point.y >= item.top && point.y < item.top + item.height) {
      return item.child;
    }
  }
  return null;
}

function handlePointerDown(event) {
  if (event.button !== 0 || !hasPreview.value || !viewport.value) {
    return;
  }
  dragState.value = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offsetX.value, originY: offsetY.value, moved: false };
  viewport.value.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (dragState.value?.pointerId === event.pointerId) {
    const deltaX = event.clientX - dragState.value.startX;
    const deltaY = event.clientY - dragState.value.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragState.value.moved = true;
    }
    offsetX.value = dragState.value.originX + deltaX;
    offsetY.value = dragState.value.originY + deltaY;
    scheduleRender();
    return;
  }
  hoveredChildIndex.value = findChildAtPoint(scenePointFromClient(event.clientX, event.clientY))?.childIndex ?? null;
  scheduleRender();
}

function handlePointerUp(event) {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  if (viewport.value?.hasPointerCapture(event.pointerId)) {
    viewport.value.releasePointerCapture(event.pointerId);
  }
  dragState.value = null;
  if (drag.moved) {
    return;
  }
  const child = findChildAtPoint(scenePointFromClient(event.clientX, event.clientY));
  const nextIndex = child?.childIndex ?? null;
  selectedChildIndex.value = selectedChildIndex.value === nextIndex ? null : nextIndex;
  scheduleRender();
}

function handlePointerLeave() {
  if (!dragState.value) {
    hoveredChildIndex.value = null;
    scheduleRender();
  }
}

function handleWheel(event) {
  if (hasPreview.value) {
    zoomAroundPoint(event.clientX, event.clientY, event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR);
  }
}

function selectGlob(index) {
  if (selectedGlobIndex.value === index) {
    return;
  }
  selectedGlobIndex.value = index;
  selectedChildIndex.value = null;
  hoveredChildIndex.value = null;
  needsFit = true;
  nextTick(() => fitLayout());
}

async function openGlobEntry(index) {
  if (!Number.isInteger(index)) {
    return;
  }
  pendingOpenGlobIndex = index;
  if (!globEntries.value.some((entry) => entry.index === index)) {
    return;
  }
  pendingOpenGlobIndex = null;
  searchQuery.value = "";
  await nextTick();
  await nextTick();
  const rowIndex = filteredGlobs.value.findIndex((entry) => entry.index === index);
  if (rowIndex < 0) {
    return;
  }
  selectedGlobIndex.value = index;
  selectedChildIndex.value = null;
  hoveredChildIndex.value = null;
  needsFit = true;
  if (globEntryList.value) {
    globEntryList.value.scrollTop = rowIndex * GLOB_LIST_ROW_HEIGHT;
    updateGlobListViewport();
  }
  await nextTick();
  fitLayout();
}

function handleOpenGlobEntry(event) {
  void openGlobEntry(event.detail?.globIndex);
}

function openMapAtGlob(mapId) {
  if (!selectedGlob.value || !currentGameId.value) {
    return;
  }
  window.dispatchEvent(new CustomEvent(REQUEST_MAP_GLOB_EVENT, {
    detail: {
      game: currentGameId.value,
      mapId,
      globIndex: selectedGlob.value.index
    }
  }));
}

async function loadAtlasImages(referenceId, atlases) {
  const loadedImages = new Map();
  await Promise.all(atlases.map(async (atlas) => {
    const cacheKey = `${referenceId}:${atlas.id}`;
    if (!imageCache.has(cacheKey)) {
      imageCache.set(cacheKey, loadImage(appUrl(getReferenceAtlasPath(state.siteConfig, referenceId, atlas))));
    }
    loadedImages.set(atlas.id, await imageCache.get(cacheKey));
  }));
  return loadedImages;
}

function clearViewerData() {
  referenceData.value = null;
  globEntries.value = [];
  globSearchTextByIndex.clear();
  atlasImages.value = new Map();
  selectedGlobIndex.value = null;
  selectedChildIndex.value = null;
  hoveredChildIndex.value = null;
  scheduleRender();
}

async function refreshFromControllerState() {
  const selected = state.current?.selected ?? null;
  const scene = state.current?.scene ?? null;
  if (!state.siteConfig || !selected?.game) {
    currentGameId.value = "";
    currentReferenceId.value = "";
    clearViewerData();
    return;
  }

  const token = ++loadToken;
  const gameId = selected.game;
  const referenceId = scene?.references?.referenceId ?? gameId;
  currentGameId.value = gameId;
  currentReferenceId.value = referenceId;
  loading.value = true;
  errorMessage.value = "";

  try {
    if (!referenceDataCache.has(referenceId)) {
      referenceDataCache.set(referenceId, fetchJson(appUrl(getReferenceDataPath(state.siteConfig, referenceId))));
    }
    const payload = await referenceDataCache.get(referenceId);
    if (token !== loadToken) {
      return;
    }
    referenceData.value = payload;
    const gameCatalog = payload?.globCatalogs?.find((entry) => entry.gameId === gameId);
    globEntries.value = Array.isArray(gameCatalog?.entries) ? gameCatalog.entries : [];
    globSearchTextByIndex.clear();
    for (const entry of globEntries.value) {
      globSearchTextByIndex.set(entry.index, `${formatGlobIndex(entry.index)} ${entry.index} ${entry.children.map((child) => `${formatShapeCode(child.shape)} ${child.frame}`).join(" ")}`.toLowerCase());
    }
    atlasImages.value = await loadAtlasImages(referenceId, payload?.atlases ?? []);
    if (token !== loadToken) {
      return;
    }
    selectedGlobIndex.value = globEntries.value[0]?.index ?? null;
    selectedChildIndex.value = null;
    hoveredChildIndex.value = null;
    needsFit = true;
    await nextTick();
    updateGlobListViewport();
    if (Number.isInteger(pendingOpenGlobIndex)) {
      void openGlobEntry(pendingOpenGlobIndex);
    } else {
      fitLayout();
    }
  } catch (error) {
    if (token !== loadToken) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : String(error);
    clearViewerData();
  } finally {
    if (token === loadToken) {
      loading.value = false;
    }
  }
}

watch(previewItems, () => scheduleRender());
watch([atlasImages, globEntries], async () => {
  await nextTick();
  redrawGlobEntryPreviews();
});
watch([zoom, offsetX, offsetY], () => scheduleRender());
watch(searchQuery, async () => {
  await nextTick();
  if (globEntryList.value) {
    globEntryList.value.scrollTop = 0;
  }
  updateGlobListViewport();
});

function handleWindowResize() {
  resizeCanvas();
  if (needsFit) {
    fitLayout();
  } else {
    scheduleRender();
  }
}

onMounted(() => {
  window.addEventListener(SCENE_CHANGED_EVENT, refreshFromControllerState);
  window.addEventListener(OPEN_GLOB_EVENT, handleOpenGlobEntry);
  window.addEventListener("resize", handleWindowResize);
  if (globEntryList.value && typeof ResizeObserver === "function") {
    globListResizeObserver = new ResizeObserver(updateGlobListViewport);
    globListResizeObserver.observe(globEntryList.value);
  }
  void refreshFromControllerState();
  scheduleRender();
});

onUnmounted(() => {
  window.removeEventListener(SCENE_CHANGED_EVENT, refreshFromControllerState);
  window.removeEventListener(OPEN_GLOB_EVENT, handleOpenGlobEntry);
  window.removeEventListener("resize", handleWindowResize);
  globListResizeObserver?.disconnect();
  globListResizeObserver = null;
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
  }
  loadToken += 1;
});
</script>

<style scoped>
.glob-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ink);
}

.glob-viewer-toolbar,
.glob-preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 0 2px 10px;
}

.glob-toolbar-summary,
.glob-preview-title-group {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.glob-toolbar-summary h1,
.glob-preview-title-group h2,
.glob-usage-heading h2,
.glob-shape-heading h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}

.glob-toolbar-summary span,
.glob-preview-title-group span,
.glob-entry-meta,
.glob-list-count,
.glob-usage-heading span {
  color: rgba(176, 197, 212, 0.76);
  font-size: 0.78rem;
}

.glob-toolbar-actions {
  display: inline-flex;
  gap: 6px;
}

.glob-toolbar-button {
  min-width: 42px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid rgba(138, 202, 221, 0.24);
  border-radius: 4px;
  background: rgba(8, 12, 18, 0.7);
  color: #edf4f7;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.glob-toolbar-button:hover:not(:disabled) {
  background: rgba(34, 68, 78, 0.85);
  border-color: rgba(138, 202, 221, 0.52);
}

.glob-toolbar-button:disabled {
  opacity: 0.48;
  cursor: default;
}

.glob-zoom-value {
  min-width: 64px;
}

.glob-viewer-content {
  display: grid;
  grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  border-top: 1px solid rgba(138, 202, 221, 0.16);
}

.glob-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid rgba(138, 202, 221, 0.16);
}

.glob-list-controls {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid rgba(138, 202, 221, 0.14);
}

.glob-list-controls label {
  font-size: 0.82rem;
  font-weight: 700;
}

.glob-list-controls input {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid rgba(138, 202, 221, 0.24);
  border-radius: 4px;
  background: rgba(8, 12, 18, 0.72);
  color: inherit;
  font: inherit;
}

.glob-entry-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.glob-entry-spacer {
  position: relative;
  width: 100%;
  min-width: 0;
}

.glob-entry-option {
  position: absolute;
  left: 0;
  height: 56px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 3px;
  width: 100%;
  min-height: 48px;
  padding: 8px 12px;
  border: 0;
  border-bottom: 1px solid rgba(138, 202, 221, 0.1);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.glob-entry-preview {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 3px;
  background: rgba(8, 12, 18, 0.72);
  image-rendering: pixelated;
}

.glob-entry-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
  align-content: center;
}

.glob-entry-option:hover {
  background: rgba(124, 182, 214, 0.08);
}

.glob-entry-option.is-selected {
  background: rgba(42, 120, 130, 0.2);
  box-shadow: inset 3px 0 #61c6b5;
}

.glob-entry-name {
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 0.82rem;
  font-weight: 700;
}

.glob-list-empty,
.glob-map-empty {
  margin: 0;
  padding: 10px 12px;
  color: rgba(176, 197, 212, 0.68);
  font-size: 0.8rem;
}

.glob-usage-panel {
  flex: 0 0 150px;
  min-height: 110px;
  border-top: 1px solid rgba(138, 202, 221, 0.2);
}

.glob-usage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 7px;
}

.glob-usage-heading h2 {
  font-size: 0.82rem;
}

.glob-map-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 108px;
  overflow: auto;
  padding: 0 12px 10px;
}

.glob-map-entry {
  padding: 4px 6px;
  border: 1px solid rgba(138, 202, 221, 0.16);
  border-radius: 3px;
  background: rgba(8, 12, 18, 0.4);
  color: rgba(226, 238, 244, 0.9);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.glob-map-entry:hover,
.glob-map-entry:focus-visible {
  border-color: rgba(97, 198, 181, 0.7);
  background: rgba(42, 120, 130, 0.2);
  outline: none;
}

.glob-preview-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 10px 12px 0;
}

.glob-preview-heading {
  min-height: 40px;
  padding-bottom: 8px;
}

.glob-preview-title-group h2 {
  font-size: 0.92rem;
}

.glob-preview-viewport {
  position: relative;
  flex: 1;
  min-height: 220px;
  overflow: hidden;
  border: 1px solid rgba(138, 202, 221, 0.18);
  background-color: #0a0c12;
  background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.018) 75%), linear-gradient(45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.018) 75%);
  background-position: 0 0, 8px 8px;
  background-size: 16px 16px;
  touch-action: none;
  cursor: grab;
}

.glob-preview-viewport.is-dragging {
  cursor: grabbing;
}

.glob-preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

.glob-preview-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  color: rgba(214, 227, 237, 0.76);
  text-align: center;
  pointer-events: none;
}

.glob-information {
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(0, 1.3fr);
  gap: 16px;
  min-height: 112px;
  max-height: 190px;
  overflow: auto;
  padding: 10px 2px 12px;
}

.glob-record-details,
.glob-shape-fields {
  display: grid;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
  align-content: start;
  gap: 4px 10px;
  margin: 0;
  font-size: 0.76rem;
}

.glob-record-details dt,
.glob-shape-fields dt {
  color: rgba(176, 197, 212, 0.7);
}

.glob-record-details dd,
.glob-shape-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.glob-shape-details {
  min-width: 0;
  border-left: 1px solid rgba(138, 202, 221, 0.16);
  padding-left: 12px;
}

.glob-shape-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 7px;
}

.glob-shape-heading h3 {
  font-size: 0.82rem;
}

.glob-shape-heading span,
.glob-shape-description,
.glob-no-child-selection {
  color: rgba(176, 197, 212, 0.76);
  font-size: 0.76rem;
}

.glob-shape-description {
  margin: 7px 0 0;
  line-height: 1.4;
}

.glob-no-child-selection {
  align-self: start;
  padding: 4px 0;
}

@media (max-width: 760px) {
  .glob-viewer-content {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(200px, 32%) minmax(0, 1fr);
  }

  .glob-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(138, 202, 221, 0.16);
  }

  .glob-entry-list {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .glob-entry-option {
    flex: 0 0 150px;
    border-right: 1px solid rgba(138, 202, 221, 0.1);
    border-bottom: 0;
  }

  .glob-usage-panel {
    flex: 0 0 88px;
    min-height: 72px;
  }

  .glob-map-list {
    max-height: 42px;
  }

  .glob-preview-panel {
    min-height: 0;
  }

  .glob-information {
    grid-template-columns: 1fr;
    gap: 8px;
    max-height: 150px;
  }

  .glob-shape-details {
    border-left: 0;
    border-top: 1px solid rgba(138, 202, 221, 0.16);
    padding: 8px 0 0;
  }
}
</style>