<template>
  <aside id="overlay-tooltip" class="overlay-tooltip" hidden aria-live="polite">
    <form v-if="tooltip.visible && tooltip.showCatalogEditor" class="tooltip-editor-form tooltip-editor-inline" @submit.prevent="handleSaveCatalog">
      <div class="tooltip-preview">
        <canvas ref="previewCanvas" class="tooltip-preview-canvas" aria-label="Selected shape preview"></canvas>
      </div>
      <div class="tooltip-header">
        <div class="tooltip-header-main">
          <div class="tooltip-eyebrow">{{ tooltip.itemLabel }}</div>
          <label class="tooltip-field tooltip-title-field">
            <span>Name</span>
            <input
              v-model="form.humanReadableId"
              class="tooltip-field-input tooltip-title-input"
              name="humanReadableId"
              type="text"
              maxlength="120"
              :placeholder="tooltip.displayName"
            >
          </label>
        </div>
        <div class="tooltip-actions">
          <button v-if="tooltip.showTeleportEggEditor" class="tooltip-action" type="button" title="Edit egg values" @click.stop="handleEditEgg" v-html="tooltip.penIconSvg"></button>
          <button v-if="tooltip.showPinnedActions" class="tooltip-action" type="button" :title="tooltip.hidden ? 'Restore shape' : 'Hide shape'" @click.stop="handleToggleHidden" v-html="tooltip.eyeIconSvg"></button>
        </div>
      </div>
      <div v-if="tooltip.hidden" class="tooltip-state">Hidden</div>
      <dl class="tooltip-grid" v-html="tooltip.metadataRowsHtml"></dl>
      <dl class="tooltip-grid">
        <dt>Roof</dt>
        <dd class="tooltip-grid-control">
          <label class="tooltip-field tooltip-grid-field">
            <span class="tooltip-grid-field-label">Roof status</span>
            <select v-model="form.roof" class="tooltip-field-input" name="roof">
              <option value="">Auto</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </dd>
        <dt>Transparency</dt>
        <dd class="tooltip-grid-control">
          <label class="tooltip-field tooltip-grid-field">
            <span class="tooltip-grid-field-label">Transparency status</span>
            <select v-model="form.semitransparency" class="tooltip-field-input" name="semitransparency">
              <option value="">Auto</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </dd>
        <dt>OOB</dt>
        <dd class="tooltip-grid-control">
          <label class="tooltip-field tooltip-grid-field">
            <span class="tooltip-grid-field-label">Black out-of-bounds surface</span>
            <select v-model="form.oob" class="tooltip-field-input" name="oob">
              <option value="">Auto</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </dd>
      </dl>
      <div v-if="tooltip.monsterSpawnerEditorHtml" ref="monsterSpawnerRoot" v-html="tooltip.monsterSpawnerEditorHtml" @click="handleMonsterSpawnerClick"></div>
      <div v-if="tooltip.warpCommand" class="tooltip-warp-row">
        <div class="tooltip-warp-command">{{ tooltip.warpCommand }}</div>
        <button class="tooltip-action tooltip-copy-button" type="button" @click.stop="handleCopyWarpCommand">Copy</button>
      </div>
      <label class="tooltip-field">
        <span>Description</span>
        <textarea v-model="form.description" class="tooltip-field-textarea" name="description" rows="4"></textarea>
      </label>
      <div v-if="tooltip.notesHtml" v-html="tooltip.notesHtml"></div>
      <p class="tooltip-editor-note">Writes directly to the local CSV and invalidates the cached scene set for this game.</p>
      <button class="tooltip-save-button" type="submit" :disabled="savingCatalog">{{ savingCatalog ? "Saving..." : "Save Catalog Entry" }}</button>
    </form>

    <template v-else-if="tooltip.visible">
      <div class="tooltip-preview">
        <canvas ref="previewCanvas" class="tooltip-preview-canvas" aria-label="Selected shape preview"></canvas>
      </div>
      <div class="tooltip-header">
        <div class="tooltip-header-main">
          <div class="tooltip-eyebrow">{{ tooltip.itemLabel }}</div>
          <div class="tooltip-field tooltip-title-field tooltip-title-static-field">
            <span>Name</span>
            <div class="tooltip-title tooltip-title-static">{{ tooltip.displayName }}</div>
          </div>
        </div>
        <div v-if="tooltip.showPinnedActions || tooltip.showTeleportEggEditor" class="tooltip-actions">
          <button v-if="tooltip.showTeleportEggEditor" class="tooltip-action" type="button" title="Edit egg values" @click.stop="handleEditEgg" v-html="tooltip.penIconSvg"></button>
          <button v-if="tooltip.showPinnedActions" class="tooltip-action" type="button" :title="tooltip.hidden ? 'Restore shape' : 'Hide shape'" @click.stop="handleToggleHidden" v-html="tooltip.eyeIconSvg"></button>
        </div>
      </div>
      <div v-if="tooltip.hidden" class="tooltip-state">Hidden</div>
      <dl class="tooltip-grid" v-html="tooltip.metadataRowsHtml"></dl>
      <div v-if="tooltip.monsterSpawnerEditorHtml" ref="monsterSpawnerRoot" v-html="tooltip.monsterSpawnerEditorHtml" @click="handleMonsterSpawnerClick"></div>
      <div v-if="tooltip.warpCommand" class="tooltip-warp-row">
        <div class="tooltip-warp-command">{{ tooltip.warpCommand }}</div>
        <button class="tooltip-action tooltip-copy-button" type="button" @click.stop="handleCopyWarpCommand">Copy</button>
      </div>
      <p v-if="tooltip.pinned && tooltip.displayDescription" class="muted">{{ tooltip.displayDescription }}</p>
      <div v-if="tooltip.notesHtml" v-html="tooltip.notesHtml"></div>
    </template>
  </aside>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  getTooltipState,
  renderTooltipPreview,
  subscribeTooltipState
} from "../../shared/tooltip-bridge.js";

const previewCanvas = ref(null);
const monsterSpawnerRoot = ref(null);
const tooltip = ref(getTooltipState());
const savingCatalog = ref(false);
const form = reactive({
  humanReadableId: "",
  description: "",
  roof: "",
  semitransparency: "",
  oob: ""
});

let unsubscribe = null;

function syncFormFromTooltip() {
  form.humanReadableId = String(tooltip.value.catalogEntry?.humanReadableId ?? "");
  form.description = String(tooltip.value.catalogEntry?.description ?? "");
  form.roof = encodeBoolean(tooltip.value.catalogEntry?.roof ?? null);
  form.semitransparency = encodeBoolean(tooltip.value.catalogEntry?.semitransparency ?? null);
  form.oob = encodeBoolean(tooltip.value.catalogEntry?.oob ?? null);
}

function encodeBoolean(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

async function redrawPreview() {
  await nextTick();
  renderTooltipPreview(previewCanvas.value, tooltip.value.item);
}

async function handleSaveCatalog() {
  if (savingCatalog.value || typeof tooltip.value.onSaveCatalog !== "function") {
    return;
  }
  savingCatalog.value = true;
  try {
    await tooltip.value.onSaveCatalog({
      humanReadableId: form.humanReadableId,
      description: form.description,
      roof: form.roof,
      semitransparency: form.semitransparency,
      oob: form.oob
    });
  } finally {
    savingCatalog.value = false;
  }
}

function handleToggleHidden() {
  tooltip.value.onToggleHidden?.();
}

function handleEditEgg() {
  tooltip.value.onEditEgg?.();
}

function handleCopyWarpCommand() {
  tooltip.value.onCopyWarpCommand?.();
}

function handleMonsterSpawnerClick(event) {
  if (!event.target.closest('[data-action="save-monster-spawner"]')) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  tooltip.value.onSaveMonsterSpawner?.(monsterSpawnerRoot.value);
}

watch(
  () => tooltip.value.version,
  async () => {
    syncFormFromTooltip();
    await redrawPreview();
  },
  { immediate: true }
);

onMounted(() => {
  unsubscribe = subscribeTooltipState((nextTooltip) => {
    tooltip.value = nextTooltip;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>