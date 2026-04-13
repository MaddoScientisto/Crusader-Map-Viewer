<template>
  <section class="wireframe-shell">
    <div ref="host" class="wireframe-host" tabindex="0"></div>
    <div class="wireframe-overlay">
      <div class="wireframe-badge">3D Wireframe</div>
      <div class="wireframe-status">{{ statusText }}</div>
      <div class="wireframe-help">{{ helpText }}</div>
      <div v-if="wireframeCount > 0" class="wireframe-count">{{ wireframeCount }} shapes</div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";
import { state } from "../controller/state.js";

const host = ref(null);
const pointerLocked = ref(false);
const dragLooking = ref(false);
const statusText = ref("Choose a PC map to inspect it in 3D.");
const wireframeCount = ref(0);

let renderer = null;
let scene = null;
let camera = null;
let worldGroup = null;
let gridHelper = null;
let resizeObserver = null;
let animationFrame = 0;
let lastFrameTime = 0;
let currentRenderKey = null;

const lookState = {
  yaw: 0,
  pitch: -0.35
};

const sceneMetrics = {
  largestSpan: 512,
  height: 128,
  centerX: 0,
  centerZ: 0
};

const dragState = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0
};

const pressedKeys = new Set();
const edgeGeometryCache = new Map();
const materialCache = new Map();

const KIND_COLORS = Object.freeze({
  base: 0xc6d3dd,
  terrain: 0x7fd2bf,
  roof: 0x7fb6ff,
  helper: 0x627487,
  egg: 0xffbd59,
  editor: 0xff8d6a
});

const helpText = computed(() => (
  pointerLocked.value
    ? "WASD move, Space up, C down, mouse look active. Press Esc to release the mouse."
    : dragLooking.value
      ? "Dragging to look. Release the mouse to stop looking. WASD moves, Space goes up, C goes down."
      : "Click to try mouse capture. If the browser denies it, hold left mouse and drag to look. WASD moves, Space goes up, C goes down."
));

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
    current.visibilityRevision ?? 0
  ].join(":");
}

function setStatus(message) {
  statusText.value = message;
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
}

function syncLookFromDirection(direction) {
  const normalized = direction.clone().normalize();
  lookState.pitch = Math.asin(THREE.MathUtils.clamp(normalized.y, -0.995, 0.995));
  lookState.yaw = Math.atan2(normalized.x, normalized.z);
  applyCameraLook();
}

function getEdgesGeometry(width, height, depth) {
  const cacheKey = `${width}:${height}:${depth}`;
  const cached = edgeGeometryCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const boxGeometry = new THREE.BoxGeometry(width, height, depth);
  const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
  boxGeometry.dispose();
  edgeGeometryCache.set(cacheKey, edgesGeometry);
  return edgesGeometry;
}

function getMaterial(kind) {
  const cacheKey = kind || "base";
  const cached = materialCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const material = new THREE.LineBasicMaterial({
    color: KIND_COLORS[cacheKey] ?? KIND_COLORS.base,
    transparent: true,
    opacity: cacheKey === "helper" ? 0.55 : 0.9
  });
  materialCache.set(cacheKey, material);
  return material;
}

function clearWorldGroup() {
  if (!worldGroup) {
    return;
  }
  while (worldGroup.children.length > 0) {
    const child = worldGroup.children[0];
    worldGroup.remove(child);
  }
  if (gridHelper) {
    scene?.remove(gridHelper);
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
    if (Array.isArray(gridHelper.material)) {
      for (const material of gridHelper.material) {
        material.dispose();
      }
    }
    gridHelper = null;
  }
}

function createGrid(span) {
  const majorSpan = Math.max(256, Math.ceil(span / 256) * 256);
  const divisions = Math.max(8, Math.min(64, Math.round(majorSpan / 128)));
  const helper = new THREE.GridHelper(majorSpan, divisions, 0x315567, 0x1b2d36);
  helper.position.set(0, 0, 0);
  return helper;
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

function rebuildScene() {
  if (!scene || !worldGroup) {
    return;
  }

  const nextRenderKey = getSceneRenderKey();
  const previousSelectionKey = currentRenderKey?.split(":").slice(0, 2).join(":") ?? null;
  const nextSelectionKey = nextRenderKey.split(":").slice(0, 2).join(":");
  const selectionChanged = previousSelectionKey !== nextSelectionKey;

  clearWorldGroup();
  wireframeCount.value = 0;

  if (!state.current) {
    currentRenderKey = nextRenderKey;
    setStatus("Choose a PC map to inspect it in 3D.");
    return;
  }

  if (!isPcSceneSelected()) {
    currentRenderKey = nextRenderKey;
    setStatus("The 3D wireframe viewer is only available for the DOS/PC scenes.");
    return;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minWorldZ = Number.POSITIVE_INFINITY;
  let maxWorldZ = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let visibleCount = 0;

  for (const item of state.current.scene.items) {
    if (state.current.hiddenIds.has(item.id)) {
      continue;
    }
    const definition = state.current.shapeDefinitions.get(item.shapeDefId) ?? null;
    const dimensions = definition?.dimensions;
    if (!dimensions || !item?.world) {
      continue;
    }

    const flipped = Boolean(item.flags?.flipped);
    const width = Math.max(1, (flipped ? dimensions.y : dimensions.x) * 32);
    const depth = Math.max(1, (flipped ? dimensions.x : dimensions.y) * 32);
    const height = Math.max(8, dimensions.z * 8);
    const minItemX = item.world.x - width;
    const maxItemX = item.world.x;
    const minItemZ = -item.world.y;
    const maxItemZ = -(item.world.y - depth);
    const minItemY = item.world.z;
    const maxItemY = item.world.z + height;

    minX = Math.min(minX, minItemX);
    maxX = Math.max(maxX, maxItemX);
    minWorldZ = Math.min(minWorldZ, minItemZ);
    maxWorldZ = Math.max(maxWorldZ, maxItemZ);
    minY = Math.min(minY, minItemY);
    maxY = Math.max(maxY, maxItemY);

    const edges = getEdgesGeometry(width, height, depth);
    const lineSegments = new THREE.LineSegments(edges, getMaterial(item.kind));
    lineSegments.position.set(
      minItemX + width / 2,
      minItemY + height / 2,
      minItemZ + depth / 2
    );
    worldGroup.add(lineSegments);
    visibleCount += 1;
  }

  currentRenderKey = nextRenderKey;
  wireframeCount.value = visibleCount;

  if (!visibleCount) {
    sceneMetrics.largestSpan = 512;
    sceneMetrics.height = 128;
    setStatus("Current PC scene has no visible shapes with 3D bounds.");
    resetCamera(selectionChanged);
    return;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minWorldZ + maxWorldZ) / 2;
  worldGroup.position.set(-centerX, -minY, -centerZ);

  sceneMetrics.largestSpan = Math.max(maxX - minX, maxWorldZ - minWorldZ, 512);
  sceneMetrics.height = Math.max(maxY - minY, 96);
  sceneMetrics.centerX = centerX;
  sceneMetrics.centerZ = centerZ;

  if (camera) {
    camera.near = 4;
    camera.far = Math.max(8192, sceneMetrics.largestSpan * 10 + sceneMetrics.height * 8);
    camera.updateProjectionMatrix();
  }

  gridHelper = createGrid(sceneMetrics.largestSpan);
  scene.add(gridHelper);

  resetCamera(selectionChanged);
  setStatus(`Viewing ${state.current.selected.game} map ${state.current.selected.mapId} as ${visibleCount} wireframe bounds.`);
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
}

function applyLookDelta(deltaX, deltaY) {
  lookState.yaw -= deltaX * 0.0024;
  lookState.pitch = THREE.MathUtils.clamp(lookState.pitch - deltaY * 0.0018, -1.45, 1.45);
  applyCameraLook();
}

function updateMovement(deltaSeconds) {
  if (!camera || pressedKeys.size === 0) {
    return;
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
    return;
  }

  const speed = Math.max(128, Math.min(3072, sceneMetrics.largestSpan * 0.45)) * (pressedKeys.has("ShiftLeft") ? 2 : 1);
  camera.position.addScaledVector(velocity.normalize(), speed * deltaSeconds);
  applyCameraLook();
}

function animate(timestamp) {
  animationFrame = window.requestAnimationFrame(animate);
  const deltaSeconds = Math.min(0.05, lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 0.016);
  lastFrameTime = timestamp;

  const nextRenderKey = getSceneRenderKey();
  if (nextRenderKey !== currentRenderKey) {
    rebuildScene();
  }

  updateMovement(deltaSeconds);
  renderer?.render(scene, camera);
}

function handlePointerLockChange() {
  pointerLocked.value = document.pointerLockElement === renderer?.domElement;
}

function handlePointerMove(event) {
  if (pointerLocked.value) {
    applyLookDelta(event.movementX, event.movementY);
    return;
  }
  if (!dragState.active || event.pointerId !== dragState.pointerId) {
    return;
  }
  const deltaX = event.clientX - dragState.lastX;
  const deltaY = event.clientY - dragState.lastY;
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
  dragLooking.value = true;
  applyLookDelta(deltaX, deltaY);
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

function handleWindowBlur() {
  pressedKeys.clear();
  dragState.active = false;
  dragState.pointerId = null;
  dragLooking.value = false;
}

function stopDragLook() {
  dragState.active = false;
  dragState.pointerId = null;
  dragLooking.value = false;
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
  dragLooking.value = false;
}

function handlePointerUp(event) {
  if (event.pointerId === dragState.pointerId) {
    stopDragLook();
  }
}

function handlePointerCancel(event) {
  if (event.pointerId === dragState.pointerId) {
    stopDragLook();
  }
}

function handlePointerLeave(event) {
  if (!pointerLocked.value && event.pointerId === dragState.pointerId) {
    stopDragLook();
  }
}

function handlePointerLockError() {
  pointerLocked.value = false;
  setStatus("Pointer lock was denied by the browser. Drag with the left mouse button to look around instead.");
}

function requestPointerLock() {
  if (!renderer?.domElement || document.pointerLockElement === renderer.domElement) {
    return;
  }
  host.value?.focus();
  const request = renderer.domElement.requestPointerLock?.();
  if (request && typeof request.catch === "function") {
    request.catch(() => {
      handlePointerLockError();
    });
  }
}

function initializeRenderer() {
  if (!host.value || renderer) {
    return;
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x081018, 1);
  host.value.append(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 4, 100000);
  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  resizeObserver = new ResizeObserver(() => resizeRenderer());
  resizeObserver.observe(host.value);

  renderer.domElement.addEventListener("click", requestPointerLock);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("pointerlockerror", handlePointerLockError);
  document.addEventListener("pointermove", handlePointerMove);
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
  animationFrame = 0;
  lastFrameTime = 0;
  pressedKeys.clear();
  stopDragLook();

  if (document.pointerLockElement === renderer?.domElement) {
    document.exitPointerLock?.();
  }

  document.removeEventListener("pointerlockchange", handlePointerLockChange);
  document.removeEventListener("pointerlockerror", handlePointerLockError);
  document.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("resize", resizeRenderer);

  resizeObserver?.disconnect();
  resizeObserver = null;

  if (renderer?.domElement) {
    renderer.domElement.removeEventListener("click", requestPointerLock);
    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
    renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
  }

  clearWorldGroup();

  for (const geometry of edgeGeometryCache.values()) {
    geometry.dispose();
  }
  edgeGeometryCache.clear();

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
  pointerLocked.value = false;
  dragLooking.value = false;
}

onMounted(() => {
  try {
    initializeRenderer();
  } catch (error) {
    console.error("3D wireframe viewer initialization failed", error);
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