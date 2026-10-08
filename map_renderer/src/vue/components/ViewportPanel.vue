<template>
  <main class="workspace">
    <div class="viewport-tabs">
      <button :class="['tab', { active: activeTab==='map' }]" @click="setActiveTab('map')">MAP</button>
      <button :class="['tab', { active: activeTab==='globs' }]" @click="setActiveTab('globs')">GLOBS</button>
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
        <div id="map-editor-toolbar" class="map-editor-toolbar" hidden>
          <button id="shape-add-button" type="button" title="Add a shape">Add</button>
          <label class="editor-toolbar-size editor-toolbar-current-layer" for="editor-current-layer">Current layer
            <select id="editor-current-layer">
              <option value="fixed">Fixed records</option>
              <option value="glob">Glob terrain (view only)</option>
            </select>
          </label>
          <label class="editor-toolbar-toggle"><input id="editor-only-show-current-layer" type="checkbox"> Only show current layer</label>
          <label class="editor-toolbar-toggle"><input id="editor-grid-snap" type="checkbox"> Grid snap</label>
          <label class="editor-toolbar-size" for="editor-grid-size">Grid size
            <select id="editor-grid-size" disabled>
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
          </label>
          <label class="editor-toolbar-toggle"><input id="editor-floor-grid" type="checkbox"> Floor grid</label>
          <span id="editor-selection-count" class="editor-selection-count" aria-live="polite">0 selected</span>
        </div>
        <Teleport to="body">
          <div id="shape-picker-modal" class="shape-picker-modal" hidden>
            <section class="shape-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="shape-picker-title">
              <header class="shape-picker-header">
                <h2 id="shape-picker-title">Add Shape</h2>
                <div class="shape-picker-view-modes" role="group" aria-label="Shape picker view">
                  <button id="shape-picker-details-button" class="is-active" type="button" aria-pressed="true">Details</button>
                  <button id="shape-picker-atlas-button" type="button" aria-pressed="false">Atlas</button>
                </div>
                <button id="shape-picker-close" class="icon-button" type="button" aria-label="Close shape picker" title="Close">×</button>
              </header>
              <label class="shape-picker-search-label" for="shape-picker-search">Search shapes</label>
              <input id="shape-picker-search" class="shape-picker-search" type="search" autocomplete="off">
              <div id="shape-picker-count" class="shape-picker-count" role="status">Loading shapes...</div>
              <div id="shape-picker-list" class="shape-picker-list"></div>
            </section>
          </div>
        </Teleport>
        <div id="empty-state" class="empty-state">Choose a detected map to build and view it.</div>
      </div>
      <section v-show="activeTab==='atlas'" class="atlas-panel">
        <AtlasViewer />
      </section>
      <section v-show="activeTab==='globs'" class="glob-panel">
        <GlobViewer />
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AtlasViewer from "./AtlasViewer.vue";
import GlobViewer from "./GlobViewer.vue";
import TooltipOverlay from "./TooltipOverlay.vue";
import UsecodeViewer from "./UsecodeViewer.vue";
import WireframeViewport3D from "./WireframeViewport3D.vue";
import { sanitizeUsecodeTarget } from "../../shared/usecode-browser.js";
import { readViewerHistoryState, updateViewerHistory } from "../../shared/viewer-history.js";

const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const SCENE_CHANGED_EVENT = "crusader-map-renderer:scene-changed";
const SET_VIEWPORT_TAB_EVENT = "crusader-map-renderer:set-viewport-tab";
const VIEWPORT_TAB_READY_EVENT = "crusader-map-renderer:viewport-tab-ready";
const MAP_VIEW_DEACTIVATED_EVENT = "crusader-map-renderer:map-view-deactivated";
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

function handleSetViewportTab(event) {
  const tab = event.detail?.tab;
  if (["map", "globs", "3d", "atlas", "usecode"].includes(tab)) {
    setActiveTab(tab);
  }
}

watch(activeTab, async (nextTab, previousTab) => {
  if (previousTab === "map" && nextTab !== "map") {
    window.dispatchEvent(new Event(MAP_VIEW_DEACTIVATED_EVENT));
  }
  await nextTick();
  window.dispatchEvent(new Event("resize"));
  window.dispatchEvent(new CustomEvent(VIEWPORT_TAB_READY_EVENT, { detail: { tab: activeTab.value } }));
});

watch(is3dAvailable, (available) => {
  if (!available && activeTab.value === "3d") {
    setActiveTab("map", { pushHistory: !restoringHistory });
  }
});

onMounted(() => {
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  window.addEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.addEventListener(SET_VIEWPORT_TAB_EVENT, handleSetViewportTab);
  window.addEventListener("popstate", restoreHistoryState);
  restoreHistoryState();
});

onUnmounted(() => {
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  window.removeEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.removeEventListener(SET_VIEWPORT_TAB_EVENT, handleSetViewportTab);
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
  flex: 0 0 auto;
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

.glob-panel {
  height: 100%;
  min-height: 0;
}

.wireframe-panel {
  height: 100%;
  min-height: 0;
}

.map-editor-toolbar[hidden],
.shape-picker-modal[hidden] {
  display: none;
}

.map-editor-toolbar {
  position: absolute;
  z-index: 8;
  bottom: 16px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 8px;
  border: 1px solid rgba(205, 218, 227, 0.24);
  border-radius: 8px;
  background: rgba(15, 23, 30, 0.94);
  color: #eef4f6;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.36);
  transform: translateX(-50%);
}

@media (max-width: 600px) {
  .viewport-tabs {
    min-width: 0;
    max-width: 100%;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .tab {
    padding: 8px 10px;
    font-size: 0.84rem;
  }
}

.map-editor-toolbar > button {
  min-height: 38px;
  padding: 7px 12px;
  border: 1px solid rgba(205, 218, 227, 0.24);
  border-radius: 6px;
  background: #1d766e;
  color: white;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.editor-toolbar-toggle,
.editor-toolbar-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 0.86rem;
  font-weight: 600;
}

.editor-toolbar-toggle input {
  width: 17px;
  height: 17px;
  margin: 0;
  accent-color: #55c6ad;
}

.editor-toolbar-size select {
  width: 74px;
  min-height: 36px;
  padding: 5px 8px;
  border: 1px solid rgba(205, 218, 227, 0.24);
  border-radius: 6px;
  background: #101820;
  color: inherit;
  font: inherit;
}

.editor-toolbar-current-layer select {
  width: 164px;
}

.editor-selection-count {
  min-width: 76px;
  color: #b8c7ce;
  font-size: 0.82rem;
  text-align: right;
  white-space: nowrap;
}

.shape-picker-modal {
  position: fixed;
  z-index: 12;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 7, 10, 0.72);
}

.shape-picker-dialog {
  display: grid;
  grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
  gap: 12px;
  width: min(760px, 100%);
  max-height: min(720px, 100%);
  padding: 18px;
  border: 1px solid rgba(205, 218, 227, 0.2);
  border-radius: 8px;
  background: #111a20;
  color: #eef4f6;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.48);
}

.shape-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.shape-picker-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.shape-picker-header .icon-button {
  width: 38px;
  min-height: 38px;
  padding: 4px;
  border-color: rgba(205, 218, 227, 0.22);
  border-radius: 6px;
  background: #1b292f;
  color: inherit;
}

.shape-picker-view-modes {
  display: inline-flex;
  justify-self: start;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(205, 218, 227, 0.16);
  border-radius: 6px;
  background: #0b1216;
}

.shape-picker-view-modes button {
  min-height: 32px;
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #b9cbd0;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
}

.shape-picker-view-modes button.is-active {
  background: #25574f;
  color: #fff;
}

.shape-picker-view-modes button:focus-visible {
  outline: 2px solid #75d8c3;
  outline-offset: 2px;
}

.shape-picker-search-label {
  font-size: 0.88rem;
}

.shape-picker-search {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid rgba(205, 218, 227, 0.22);
  border-radius: 6px;
  background: #081116;
  color: inherit;
  font: inherit;
}

.shape-picker-count {
  color: #a9bbc3;
  font-size: 0.82rem;
}

.shape-picker-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  align-content: start;
  gap: 7px;
  overflow: auto;
  overscroll-behavior: contain;
  min-height: 0;
  padding-right: 4px;
}

.shape-picker-list.is-atlas-view {
  grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
}

:deep(.shape-picker-option) {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 8px;
  border: 1px solid rgba(205, 218, 227, 0.14);
  border-radius: 6px;
  background: #18242a;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

:deep(.shape-picker-option:hover),
:deep(.shape-picker-option:focus-visible) {
  border-color: #55c6ad;
  background: #20352f;
  outline: none;
}

:deep(.shape-picker-list.is-atlas-view .shape-picker-option) {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-height: 92px;
  padding: 6px;
  text-align: center;
}

:deep(.shape-picker-list.is-atlas-view .shape-picker-copy) {
  min-width: 0;
  width: 100%;
}

:deep(.shape-picker-list.is-atlas-view .shape-picker-name) {
  display: none;
}

:deep(.shape-picker-list.is-atlas-view .shape-picker-code) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

:deep(.shape-picker-preview) {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(205, 218, 227, 0.12);
  border-radius: 4px;
  background-color: #0a1115;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}

:deep(.shape-picker-copy) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

:deep(.shape-picker-name) {
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.shape-picker-code) {
  color: #9eb0b8;
  font-size: 0.76rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .map-editor-toolbar {
    bottom: 8px;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 10px;
    padding: 7px;
  }

  .editor-selection-count {
    display: none;
  }

  .shape-picker-dialog {
    padding: 12px;
  }

  .shape-picker-list {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>