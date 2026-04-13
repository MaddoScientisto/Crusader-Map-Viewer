<template>
  <main class="workspace">
    <div class="viewport-tabs">
      <button :class="['tab', { active: activeTab==='map' }]" @click="setActiveTab('map')">MAP</button>
      <button v-if="is3dAvailable" :class="['tab', { active: activeTab==='3d' }]" @click="setActiveTab('3d')">3D</button>
      <button :class="['tab', { active: activeTab==='atlas' }]" @click="setActiveTab('atlas')">ATLAS</button>
      <button :class="['tab', { active: activeTab==='usecode' }]" @click="setActiveTab('usecode')">USECODE</button>
    </div>
    <div class="workspace-body">
      <div v-show="activeTab==='map'" id="viewport" class="viewport">
        <div id="viewport-hint" class="viewport-hint">Drag to pan. Scroll or pinch to zoom.</div>
        <canvas id="scene-canvas" class="scene-canvas"></canvas>
        <div id="inspect-highlight" class="inspect-highlight" hidden></div>
        <div id="notification-toast" class="notification-toast" hidden></div>
        <div id="empty-state" class="empty-state">Choose a detected map to build and view it.</div>
      </div>
      <section v-show="activeTab==='atlas'" class="atlas-panel">
        <AtlasViewer />
      </section>
      <section v-if="activeTab==='3d' && is3dAvailable" class="wireframe-panel">
        <WireframeViewport3D />
      </section>
      <section v-show="activeTab==='usecode'" class="usecode-panel">
        <UsecodeViewer />
      </section>
      <TooltipOverlay />
    </div>
  </main>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AtlasViewer from "./AtlasViewer.vue";
import TooltipOverlay from "./TooltipOverlay.vue";
import UsecodeViewer from "./UsecodeViewer.vue";
import { sanitizeUsecodeTarget } from "../../shared/usecode-browser.js";
import { readViewerHistoryState, updateViewerHistory } from "../../shared/viewer-history.js";

const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const SCENE_CHANGED_EVENT = "crusader-map-renderer:scene-changed";
const WireframeViewport3D = defineAsyncComponent(() => import("./WireframeViewport3D.vue"));
const activeTab = ref(readViewerHistoryState().tab || "map");
const lastUsecodeTarget = ref(readViewerHistoryState().usecodeTarget);
const selectedGame = ref(readViewerHistoryState().game || null);
let restoringHistory = false;

function isPcGameId(gameId) {
  return typeof gameId === "string" && gameId.length > 0 && !gameId.startsWith("psx");
}

const is3dAvailable = computed(() => isPcGameId(selectedGame.value));

function setActiveTab(nextTab, options = {}) {
  const pushHistory = options.pushHistory !== false;
  if (nextTab === "3d" && !is3dAvailable.value) {
    nextTab = "map";
  }
  if (nextTab === "usecode" && options.usecodeTarget) {
    lastUsecodeTarget.value = sanitizeUsecodeTarget(options.usecodeTarget);
  }
  activeTab.value = nextTab;
  if (!pushHistory || restoringHistory) {
    return;
  }
  updateViewerHistory({
    tab: nextTab,
    usecodeTarget: nextTab === "usecode" ? lastUsecodeTarget.value : lastUsecodeTarget.value
  });
}

function handleOpenUsecodeTarget(event) {
  const target = sanitizeUsecodeTarget(event.detail);
  if (target) {
    lastUsecodeTarget.value = target;
  }
  setActiveTab("usecode", { pushHistory: !restoringHistory, usecodeTarget: target });
}

function restoreHistoryState() {
  const historyState = readViewerHistoryState();
  restoringHistory = true;
  try {
    selectedGame.value = historyState.game || selectedGame.value;
    lastUsecodeTarget.value = historyState.usecodeTarget || lastUsecodeTarget.value;
    activeTab.value = historyState.tab || "map";
    if (activeTab.value === "3d" && !isPcGameId(selectedGame.value)) {
      activeTab.value = "map";
    }
    if (activeTab.value === "usecode" && lastUsecodeTarget.value) {
      window.dispatchEvent(new CustomEvent(OPEN_USECODE_TARGET_EVENT, { detail: lastUsecodeTarget.value }));
    }
  } finally {
    restoringHistory = false;
  }
}

function handleSceneChanged(event) {
  selectedGame.value = event.detail?.game ?? null;
  if (activeTab.value === "3d" && !isPcGameId(selectedGame.value)) {
    setActiveTab("map", { pushHistory: !restoringHistory });
  }
}

watch(activeTab, async () => {
  await nextTick();
  window.dispatchEvent(new Event("resize"));
});

watch(is3dAvailable, (available) => {
  if (!available && activeTab.value === "3d") {
    setActiveTab("map", { pushHistory: !restoringHistory });
  }
});

onMounted(() => {
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  window.addEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.addEventListener("popstate", restoreHistoryState);
  restoreHistoryState();
});

onUnmounted(() => {
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  window.removeEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.removeEventListener("popstate", restoreHistoryState);
});
</script>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.workspace-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.viewport-tabs {
  display: flex;
  gap: 10px;
}

.tab {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(8, 12, 18, 0.45);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tab.active {
  background: linear-gradient(180deg, rgba(13, 108, 125, 0.9) 0%, rgba(8, 76, 92, 0.95) 100%);
  border-color: rgba(124, 182, 214, 0.4);
  color: white;
}

.usecode-panel {
  height: 100%;
  min-height: 0;
}

.atlas-panel {
  height: 100%;
  min-height: 0;
}

.wireframe-panel {
  height: 100%;
  min-height: 0;
}
</style>