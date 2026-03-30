<template>
  <div id="egg-edit-modal" class="modal-backdrop" :hidden="!modal.visible" @click="handleBackdropClick">
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="egg-edit-title">
      <div class="modal-header">
        <h2 id="egg-edit-title" class="modal-title">{{ modal.title }}</h2>
        <button class="tooltip-action modal-close-button" type="button" aria-label="Close egg editor" @click="handleClose">×</button>
      </div>
      <form class="tooltip-editor-form modal-form" @submit.prevent="handleSubmit">
        <label class="tooltip-field">
          <span>Teleport ID</span>
          <input
            ref="teleportIdInput"
            class="tooltip-field-input"
            name="teleportId"
            type="number"
            min="0"
            max="255"
            step="1"
            v-model="teleportId"
            @input="handleInput"
          >
        </label>
        <p class="tooltip-editor-note">{{ modal.note }}</p>
        <p class="tooltip-warning" :hidden="!modal.warning">{{ modal.warning }}</p>
        <button class="tooltip-save-button" type="submit">Save Teleport ID</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  closeEggEditState,
  getEggEditState,
  subscribeEggEditState,
  setEggEditWarning
} from "../../shared/egg-edit-bridge.js";

const modal = ref(getEggEditState());
const teleportId = ref("");
const teleportIdInput = ref(null);

let unsubscribe = null;

function handleClose() {
  closeEggEditState();
}

function handleBackdropClick(event) {
  if (event.target.id === "egg-edit-modal") {
    handleClose();
  }
}

function handleInput() {
  if (typeof modal.value.onValidate !== "function") {
    return;
  }
  try {
    setEggEditWarning(modal.value.onValidate({
      itemId: modal.value.itemId,
      teleportId: teleportId.value
    }) ?? "");
  } catch (error) {
    setEggEditWarning(error instanceof Error ? error.message : String(error));
  }
}

function handleSubmit() {
  modal.value.onSubmit?.({
    itemId: modal.value.itemId,
    teleportId: teleportId.value
  });
}

watch(
  () => modal.value.version,
  async () => {
    teleportId.value = String(modal.value.teleportId ?? "");
    if (modal.value.visible) {
      await nextTick();
      teleportIdInput.value?.focus();
      teleportIdInput.value?.select();
    }
  },
  { immediate: true }
);

onMounted(() => {
  unsubscribe = subscribeEggEditState((nextState) => {
    modal.value = nextState;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>