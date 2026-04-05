<template>
  <main class="workspace">
    <div class="viewport-tabs">
      <button :class="['tab', { active: activeTab==='map' }]" @click="setActiveTab('map')">MAP</button>
      <button :class="['tab', { active: activeTab==='atlas' }]" @click="setActiveTab('atlas')">ATLAS</button>
      <button :class="['tab', { active: activeTab==='usecode' }]" @click="setActiveTab('usecode')">USECODE</button>
    </div>
    <div class="workspace-body">
      <div v-show="activeTab==='map'" id="viewport" class="viewport">
        <div id="viewport-hint" class="viewport-hint">Drag to pan. Scroll or pinch to zoom.</div>
        <canvas id="scene-canvas" class="scene-canvas"></canvas>
        <div id="inspect-highlight" class="inspect-highlight" hidden></div>
        <TooltipOverlay />
        <div id="notification-toast" class="notification-toast" hidden></div>
        <div id="empty-state" class="empty-state">Choose a detected map to build and view it.</div>
      </div>
      <section v-show="activeTab==='atlas'" class="atlas-panel">
        <AtlasViewer />
      </section>
      <section v-show="activeTab==='usecode'" class="usecode-panel">
        <UsecodeViewer />
      </section>
    </div>
  </main>
</template>

<script setup>
import AtlasViewer from "./AtlasViewer.vue";
import TooltipOverlay from "./TooltipOverlay.vue";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import UsecodeViewer from "./UsecodeViewer.vue";
import { sanitizeUsecodeTarget } from "../../shared/usecode-browser.js";
import { readViewerHistoryState, updateViewerHistory } from "../../shared/viewer-history.js";

const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const activeTab = ref(readViewerHistoryState().tab || "map");
const lastUsecodeTarget = ref(readViewerHistoryState().usecodeTarget);
let restoringHistory = false;

function setActiveTab(nextTab, options = {}) {
  const pushHistory = options.pushHistory !== false;
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
    lastUsecodeTarget.value = historyState.usecodeTarget || lastUsecodeTarget.value;
    activeTab.value = historyState.tab || "map";
    if (activeTab.value === "usecode" && lastUsecodeTarget.value) {
      window.dispatchEvent(new CustomEvent(OPEN_USECODE_TARGET_EVENT, { detail: lastUsecodeTarget.value }));
    }
  } finally {
    restoringHistory = false;
  }
}

watch(activeTab, async () => {
  await nextTick();
  window.dispatchEvent(new Event("resize"));
});

onMounted(() => {
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  window.addEventListener("popstate", restoreHistoryState);
  restoreHistoryState();
});

onUnmounted(() => {
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
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
</style>