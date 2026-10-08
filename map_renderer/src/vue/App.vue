<template>
  <div class="shell">
    <SidePanel />
    <div id="panel-resizer" class="panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize side panel"></div>
    <ViewportPanel />
    <EggEditModal />
    <UnsavedChangesModal />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import SidePanel from "./components/SidePanel.vue";
import ViewportPanel from "./components/ViewportPanel.vue";
import EggEditModal from "./components/EggEditModal.vue";
import UnsavedChangesModal from "./components/UnsavedChangesModal.vue";

onMounted(() => {
  void import("./controller/renderer-app.js").catch((error) => {
    console.error("Vue renderer controller bootstrap failed", error);
  });
});
</script>