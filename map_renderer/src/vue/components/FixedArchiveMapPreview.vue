<template>
  <div ref="viewport" class="fixed-map-preview">
    <canvas ref="canvas" aria-label="Uploaded FIXED map preview"></canvas>
    <div v-if="message" class="fixed-map-preview-message">{{ message }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { mapWorldToScenePoint } from "../controller/map-editor-geometry.js";

const props = defineProps({
  items: { type: Array, default: () => [] },
  referenceData: { type: Object, default: null },
  atlasImages: { type: Map, default: () => new Map() },
  gameId: { type: String, default: "" }
});

const viewport = ref(null);
const canvas = ref(null);
let renderFrame = 0;

const message = computed(() => {
  if (!props.items.length) {
    return "This map slot has no records.";
  }
  if (!props.gameId) {
    return "Load a map to use the selected game's preview assets.";
  }
  if (!props.referenceData) {
    return "Map records loaded; reference sprites are unavailable.";
  }
  return "";
});

function draw() {
  renderFrame = 0;
  const element = canvas.value;
  const surface = viewport.value;
  if (!element || !surface || !surface.clientWidth || !surface.clientHeight) {
    return;
  }
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(surface.clientWidth * ratio);
  const height = Math.round(surface.clientHeight * ratio);
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  const context = element.getContext("2d", { alpha: false });
  if (!context) {
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, surface.clientWidth, surface.clientHeight);
  context.fillStyle = "#10151a";
  context.fillRect(0, 0, surface.clientWidth, surface.clientHeight);
  if (!props.items.length) {
    return;
  }

  const sprites = new Map((props.referenceData?.sprites ?? []).map((sprite) => [sprite.id, sprite]));
  const nodes = props.items.map((item) => {
    const point = mapWorldToScenePoint({ x: item.x, y: item.y, z: item.z });
    const sprite = sprites.get(`sprite:${item.shape}:${item.frame}`) ?? null;
    return {
      item,
      sprite,
      image: sprite ? props.atlasImages.get(sprite.atlasId) ?? null : null,
      left: point.x - (sprite?.xoff ?? 3),
      top: point.y - (sprite?.yoff ?? 6),
      width: sprite?.width ?? 6,
      height: sprite?.height ?? 6
    };
  });
  const minX = Math.min(...nodes.map((node) => node.left));
  const minY = Math.min(...nodes.map((node) => node.top));
  const maxX = Math.max(...nodes.map((node) => node.left + node.width));
  const maxY = Math.max(...nodes.map((node) => node.top + node.height));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const scale = Math.min(4, (surface.clientWidth - 28) / boundsWidth, (surface.clientHeight - 28) / boundsHeight);
  const offsetX = (surface.clientWidth - boundsWidth * scale) / 2;
  const offsetY = (surface.clientHeight - boundsHeight * scale) / 2;
  context.imageSmoothingEnabled = false;
  for (const node of nodes) {
    const x = offsetX + (node.left - minX) * scale;
    const y = offsetY + (node.top - minY) * scale;
    const drawWidth = Math.max(2, node.width * scale);
    const drawHeight = Math.max(2, node.height * scale);
    if (node.image && node.sprite) {
      context.drawImage(
        node.image,
        node.sprite.x,
        node.sprite.y,
        node.sprite.width,
        node.sprite.height,
        x,
        y,
        drawWidth,
        drawHeight
      );
    } else {
      context.fillStyle = "#58b7a2";
      context.fillRect(x, y, drawWidth, drawHeight);
    }
  }
}

function scheduleDraw() {
  if (!renderFrame) {
    renderFrame = window.requestAnimationFrame(draw);
  }
}

watch(() => [props.items, props.referenceData, props.atlasImages, props.gameId], scheduleDraw, { deep: false });

onMounted(() => {
  window.addEventListener("resize", scheduleDraw);
  scheduleDraw();
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleDraw);
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
  }
});
</script>

<style scoped>
.fixed-map-preview {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(138, 202, 221, 0.18);
  background-color: #10151a;
  background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.025) 75%), linear-gradient(45deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.025) 75%);
  background-position: 0 0, 8px 8px;
  background-size: 16px 16px;
}

.fixed-map-preview canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

.fixed-map-preview-message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  color: rgba(226, 238, 244, 0.74);
  font-size: 0.8rem;
  text-align: center;
  pointer-events: none;
}
</style>