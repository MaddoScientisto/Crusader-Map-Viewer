<template>
  <div class="shell" :class="{ 'is-panel-collapsed': !isPanelOpen }">
    <SidePanel @collapse="isPanelOpen = false" />
    <div id="panel-resizer" class="panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize side panel"></div>
    <ViewportPanel />
    <EggEditModal />
    <UnsavedChangesModal />
    <button
      v-if="!isPanelOpen"
      class="panel-open-button"
      type="button"
      aria-label="Show side menu"
      aria-controls="side-panel"
      aria-expanded="false"
      title="Show side menu"
      @click="isPanelOpen = true"
    >
      <span class="panel-open-icon" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import SidePanel from "./components/SidePanel.vue";
import ViewportPanel from "./components/ViewportPanel.vue";
import EggEditModal from "./components/EggEditModal.vue";
import UnsavedChangesModal from "./components/UnsavedChangesModal.vue";

const isPanelOpen = ref(true);

onMounted(() => {
  void import("./controller/renderer-app.js").catch((error) => {
    console.error("Vue renderer controller bootstrap failed", error);
  });
});
</script>