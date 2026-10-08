<template>
  <Teleport to="body">
    <div
      v-if="confirmation.visible"
      class="modal-backdrop unsaved-map-change-backdrop"
      @click="handleBackdropClick"
    >
      <section
        class="modal-panel unsaved-map-change-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-map-change-title"
        aria-describedby="unsaved-map-change-description"
        @click.stop
        @keydown.esc.stop.prevent="handleStay"
      >
        <header class="modal-header">
          <h2 id="unsaved-map-change-title" class="modal-title">Unsaved map edits</h2>
        </header>
        <p id="unsaved-map-change-description" class="unsaved-map-change-copy">
          This map has unsaved record edits. Download its Map Binary to keep them before continuing.
        </p>
        <div class="unsaved-map-change-actions">
          <button ref="stayButton" class="tooltip-action" type="button" @click="handleStay">Keep editing</button>
          <button class="tooltip-action unsaved-map-change-discard" type="button" @click="handleDiscard">
            Discard and continue
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  getUnsavedMapChangeState,
  resolveUnsavedMapChangeConfirmation,
  subscribeUnsavedMapChange
} from "../../shared/unsaved-map-change-bridge.js";

const confirmation = ref(getUnsavedMapChangeState());
const stayButton = ref(null);
let unsubscribe = null;

function handleStay() {
  resolveUnsavedMapChangeConfirmation(false);
}

function handleDiscard() {
  resolveUnsavedMapChangeConfirmation(true);
}

function handleBackdropClick(event) {
  if (event.target === event.currentTarget) {
    handleStay();
  }
}

watch(
  () => confirmation.value.version,
  async () => {
    if (confirmation.value.visible) {
      await nextTick();
      stayButton.value?.focus();
    }
  }
);

onMounted(() => {
  unsubscribe = subscribeUnsavedMapChange((nextState) => {
    confirmation.value = nextState;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>

<style scoped>
.unsaved-map-change-backdrop {
  z-index: 30;
}

.unsaved-map-change-copy {
  margin: 0;
  color: rgba(233, 240, 243, 0.84);
  line-height: 1.5;
}

.unsaved-map-change-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}

.unsaved-map-change-actions .tooltip-action {
  min-width: 0;
  min-height: 42px;
  padding: 8px;
}

.unsaved-map-change-discard {
  border-color: rgba(201, 99, 80, 0.52);
  background: #853e35;
  color: #fff;
}

@media (max-width: 420px) {
  .unsaved-map-change-actions {
    grid-template-columns: 1fr;
  }
}
</style>