<template>
  <main class="workspace">
    <div id="viewport" class="viewport">
      <div id="viewport-hint" class="viewport-hint">Drag to pan. Scroll or pinch to zoom.</div>
      <canvas id="scene-canvas" class="scene-canvas"></canvas>
      <div id="inspect-highlight" class="inspect-highlight" hidden></div>
      <TooltipOverlay />
      <div id="notification-toast" class="notification-toast" hidden></div>
      <div id="empty-state" class="empty-state">Choose a detected map to build and view it.</div>
    </div>
  </main>
</template>

<script setup>
import TooltipOverlay from "./TooltipOverlay.vue";
</script>