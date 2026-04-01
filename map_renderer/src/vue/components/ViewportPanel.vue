<template>
  <main class="workspace">
    <div class="viewport-tabs">
      <button :class="['tab', { active: activeTab==='map' }]" @click="activeTab='map'">MAP</button>
      <button :class="['tab', { active: activeTab==='usecode' }]" @click="activeTab='usecode'">USECODE</button>
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
      <section v-show="activeTab==='usecode'" class="usecode-panel">
        <UsecodeViewer />
      </section>
    </div>
  </main>
</template>

<script setup>
import TooltipOverlay from "./TooltipOverlay.vue";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import UsecodeViewer from "./UsecodeViewer.vue";

const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const activeTab = ref("map");

function handleOpenUsecodeTarget() {
  activeTab.value = "usecode";
}

watch(activeTab, async (nextTab) => {
  if (nextTab !== "map") {
    return;
  }
  await nextTick();
  window.dispatchEvent(new Event("resize"));
});

onMounted(() => {
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
});

onUnmounted(() => {
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
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
</style>