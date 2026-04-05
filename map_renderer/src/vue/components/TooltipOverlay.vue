<template>
  <aside id="overlay-tooltip" class="overlay-tooltip" hidden aria-live="polite">
    <form v-if="tooltip.visible && tooltip.showCatalogEditor" class="tooltip-editor-form tooltip-editor-inline overlay-tooltip-scroll" @submit.prevent="handleSaveCatalog">
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
          <div
            v-if="tooltip.usecodeTarget"
            class="tooltip-usecode-action"
            @mouseenter="handleUsecodePreviewEnter"
            @mouseleave="scheduleHideUsecodePreview"
          >
            <button class="tooltip-action tooltip-usecode-button" type="button" :title="tooltip.usecodeTarget.title" @click.stop="handleOpenUsecode">USECODE</button>
          </div>
          <button v-if="tooltip.pinned" class="tooltip-action" type="button" title="Open modal detail" @click.stop="openModal">Open</button>
          <button v-if="tooltip.onCopyStableId" class="tooltip-action tooltip-copy-id-button" type="button" title="Copy fixed or stable ID" @click.stop="handleCopyStableId">ID</button>
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
      <div class="overlay-tooltip-scroll">
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
        <div v-if="tooltip.pinned || tooltip.showPinnedActions || tooltip.showTeleportEggEditor || tooltip.usecodeTarget || tooltip.onCopyStableId" class="tooltip-actions">
          <div
            v-if="tooltip.usecodeTarget"
            class="tooltip-usecode-action"
            @mouseenter="handleUsecodePreviewEnter"
            @mouseleave="scheduleHideUsecodePreview"
          >
            <button class="tooltip-action tooltip-usecode-button" type="button" :title="tooltip.usecodeTarget.title" @click.stop="handleOpenUsecode">USECODE</button>
          </div>
          <button v-if="tooltip.pinned" class="tooltip-action" type="button" title="Open modal detail" @click.stop="openModal">Open</button>
          <button v-if="tooltip.onCopyStableId" class="tooltip-action tooltip-copy-id-button" type="button" title="Copy fixed or stable ID" @click.stop="handleCopyStableId">ID</button>
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
      </div>
    </template>
  </aside>
  <teleport to="body">
    <div v-if="modalOpen && tooltip.visible && tooltip.pinned" class="modal-backdrop tooltip-modal-backdrop" @click="closeModal">
      <aside class="overlay-tooltip is-pinned is-modal tooltip-detail-modal" @click.stop>
        <form v-if="tooltip.showCatalogEditor" class="tooltip-editor-form tooltip-editor-inline overlay-tooltip-scroll tooltip-modal-layout" @submit.prevent="handleSaveCatalog">
          <div class="tooltip-modal-primary">
            <div class="tooltip-preview tooltip-modal-preview">
              <canvas ref="modalPreviewCanvas" class="tooltip-preview-canvas" aria-label="Selected shape preview"></canvas>
            </div>
            <div class="tooltip-header tooltip-modal-header">
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
                <div
                  v-if="tooltip.usecodeTarget"
                  class="tooltip-usecode-action"
                  @mouseenter="handleUsecodePreviewEnter"
                  @mouseleave="scheduleHideUsecodePreview"
                >
                  <button class="tooltip-action tooltip-usecode-button" type="button" :title="tooltip.usecodeTarget.title" @click.stop="handleOpenUsecode">USECODE</button>
                </div>
                <button v-if="tooltip.onCopyStableId" class="tooltip-action tooltip-copy-id-button" type="button" title="Copy fixed or stable ID" @click.stop="handleCopyStableId">ID</button>
                <button v-if="tooltip.showTeleportEggEditor" class="tooltip-action" type="button" title="Edit egg values" @click.stop="handleEditEgg" v-html="tooltip.penIconSvg"></button>
                <button v-if="tooltip.showPinnedActions" class="tooltip-action" type="button" :title="tooltip.hidden ? 'Restore shape' : 'Hide shape'" @click.stop="handleToggleHidden" v-html="tooltip.eyeIconSvg"></button>
                <button class="tooltip-action" type="button" title="Close modal" @click.stop="closeModal">×</button>
              </div>
            </div>
          </div>
          <div class="tooltip-modal-secondary">
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
            <div v-if="tooltip.monsterSpawnerEditorHtml" ref="modalMonsterSpawnerRoot" v-html="tooltip.monsterSpawnerEditorHtml" @click="handleMonsterSpawnerClick"></div>
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
          </div>
        </form>

        <div v-else class="overlay-tooltip-scroll tooltip-modal-layout">
          <div class="tooltip-modal-primary">
            <div class="tooltip-preview tooltip-modal-preview">
              <canvas ref="modalPreviewCanvas" class="tooltip-preview-canvas" aria-label="Selected shape preview"></canvas>
            </div>
            <div class="tooltip-header tooltip-modal-header">
              <div class="tooltip-header-main">
                <div class="tooltip-eyebrow">{{ tooltip.itemLabel }}</div>
                <div class="tooltip-field tooltip-title-field tooltip-title-static-field">
                  <span>Name</span>
                  <div class="tooltip-title tooltip-title-static">{{ tooltip.displayName }}</div>
                </div>
              </div>
              <div class="tooltip-actions">
                <div
                  v-if="tooltip.usecodeTarget"
                  class="tooltip-usecode-action"
                  @mouseenter="handleUsecodePreviewEnter"
                  @mouseleave="scheduleHideUsecodePreview"
                >
                  <button class="tooltip-action tooltip-usecode-button" type="button" :title="tooltip.usecodeTarget.title" @click.stop="handleOpenUsecode">USECODE</button>
                </div>
                <button v-if="tooltip.onCopyStableId" class="tooltip-action tooltip-copy-id-button" type="button" title="Copy fixed or stable ID" @click.stop="handleCopyStableId">ID</button>
                <button v-if="tooltip.showTeleportEggEditor" class="tooltip-action" type="button" title="Edit egg values" @click.stop="handleEditEgg" v-html="tooltip.penIconSvg"></button>
                <button v-if="tooltip.showPinnedActions" class="tooltip-action" type="button" :title="tooltip.hidden ? 'Restore shape' : 'Hide shape'" @click.stop="handleToggleHidden" v-html="tooltip.eyeIconSvg"></button>
                <button class="tooltip-action" type="button" title="Close modal" @click.stop="closeModal">×</button>
              </div>
            </div>
          </div>
          <div class="tooltip-modal-secondary">
            <div v-if="tooltip.hidden" class="tooltip-state">Hidden</div>
            <dl class="tooltip-grid" v-html="tooltip.metadataRowsHtml"></dl>
            <div v-if="tooltip.monsterSpawnerEditorHtml" ref="modalMonsterSpawnerRoot" v-html="tooltip.monsterSpawnerEditorHtml" @click="handleMonsterSpawnerClick"></div>
            <div v-if="tooltip.warpCommand" class="tooltip-warp-row">
              <div class="tooltip-warp-command">{{ tooltip.warpCommand }}</div>
              <button class="tooltip-action tooltip-copy-button" type="button" @click.stop="handleCopyWarpCommand">Copy</button>
            </div>
            <p v-if="tooltip.displayDescription" class="muted">{{ tooltip.displayDescription }}</p>
            <div v-if="tooltip.notesHtml" v-html="tooltip.notesHtml"></div>
          </div>
        </div>
      </aside>
    </div>
    <div
      v-if="usecodePreview.visible"
      class="tooltip-usecode-popover"
      :style="usecodePreviewStyle"
      @mouseenter="keepUsecodePreviewOpen"
      @mouseleave="scheduleHideUsecodePreview"
    >
      <div class="tooltip-usecode-popover-header">
        <div class="tooltip-usecode-popover-title">{{ usecodePreview.title }}</div>
        <div v-if="usecodePreview.path" class="tooltip-usecode-popover-path">{{ usecodePreview.path }}</div>
      </div>
      <div v-if="usecodePreview.loading" class="tooltip-usecode-popover-empty">Loading preview...</div>
      <div v-else-if="usecodePreview.error" class="tooltip-usecode-popover-empty">{{ usecodePreview.error }}</div>
      <pre v-else class="tooltip-usecode-preview" v-html="usecodePreview.html"></pre>
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { state } from "../controller/state.js";
import {
  getTooltipState,
  renderTooltipPreview,
  subscribeTooltipState
} from "../../shared/tooltip-bridge.js";
import {
  describeUsecodeTarget,
  highlightUsecodeText,
  loadUsecodeText,
  resolveUsecodeTargetFile
} from "../../shared/usecode-browser.js";

const previewCanvas = ref(null);
const modalPreviewCanvas = ref(null);
const monsterSpawnerRoot = ref(null);
const modalMonsterSpawnerRoot = ref(null);
const tooltip = ref(getTooltipState());
const savingCatalog = ref(false);
const modalOpen = ref(false);
const usecodePreview = reactive({
  visible: false,
  loading: false,
  error: "",
  html: "",
  title: "",
  path: "",
  left: 16,
  top: 16,
  width: 520
});
const form = reactive({
  humanReadableId: "",
  description: "",
  roof: "",
  semitransparency: "",
  oob: ""
});

let unsubscribe = null;
let usecodePreviewHideTimer = null;
let usecodePreviewToken = 0;

const usecodePreviewStyle = computed(() => ({
  left: `${usecodePreview.left}px`,
  top: `${usecodePreview.top}px`,
  width: `${usecodePreview.width}px`
}));

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
  renderTooltipPreview(modalPreviewCanvas.value, tooltip.value.item);
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

function resetUsecodePreview() {
  usecodePreview.visible = false;
  usecodePreview.loading = false;
  usecodePreview.error = "";
  usecodePreview.html = "";
  usecodePreview.title = "";
  usecodePreview.path = "";
}

function positionUsecodePreview(anchorElement) {
  if (!anchorElement) {
    return;
  }
  const rect = anchorElement.getBoundingClientRect();
  const margin = 16;
  const gap = 10;
  const width = Math.min(520, Math.max(280, window.innerWidth - margin * 2));
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const left = Math.min(Math.max(margin, rect.right - width), maxLeft);
  const estimatedHeight = Math.min(420, Math.max(180, window.innerHeight * 0.6));
  const showAbove = rect.bottom + gap + estimatedHeight > window.innerHeight - margin && rect.top - gap - estimatedHeight >= margin;
  usecodePreview.width = width;
  usecodePreview.left = left;
  usecodePreview.top = showAbove
    ? Math.max(margin, rect.top - gap - estimatedHeight)
    : Math.min(window.innerHeight - margin - 120, rect.bottom + gap);
}

function clearUsecodePreviewHideTimer() {
  if (usecodePreviewHideTimer) {
    clearTimeout(usecodePreviewHideTimer);
    usecodePreviewHideTimer = null;
  }
}

function scheduleHideUsecodePreview() {
  clearUsecodePreviewHideTimer();
  usecodePreviewHideTimer = window.setTimeout(() => {
    usecodePreview.visible = false;
  }, 120);
}

function keepUsecodePreviewOpen() {
  clearUsecodePreviewHideTimer();
}

async function handleUsecodePreviewEnter(event) {
  const target = tooltip.value.usecodeTarget;
  const gameId = state.current?.selected?.game;
  if (!target || !gameId) {
    return;
  }

  clearUsecodePreviewHideTimer();
  positionUsecodePreview(event?.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  usecodePreview.visible = true;
  usecodePreview.loading = true;
  usecodePreview.error = "";
  usecodePreview.html = "";
  usecodePreview.title = describeUsecodeTarget(target);
  usecodePreview.path = "";
  const currentToken = ++usecodePreviewToken;

  try {
    const file = await resolveUsecodeTargetFile(state.siteConfig, gameId, target);
    if (currentToken !== usecodePreviewToken) {
      return;
    }
    if (!file) {
      usecodePreview.error = `No usecode file matched ${describeUsecodeTarget(target)}.`;
      return;
    }

    const text = await loadUsecodeText(state.siteConfig, gameId, file.path);
    if (currentToken !== usecodePreviewToken) {
      return;
    }

    usecodePreview.path = file.rel || file.path;
    usecodePreview.html = highlightUsecodeText(text);
  } catch (error) {
    if (currentToken !== usecodePreviewToken) {
      return;
    }
    usecodePreview.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (currentToken === usecodePreviewToken) {
      usecodePreview.loading = false;
    }
  }
}

function handleToggleHidden() {
  tooltip.value.onToggleHidden?.();
}

function handleEditEgg() {
  tooltip.value.onEditEgg?.();
}

function handleOpenUsecode() {
  resetUsecodePreview();
  tooltip.value.onOpenUsecode?.();
}

function handleCopyWarpCommand() {
  tooltip.value.onCopyWarpCommand?.();
}

function handleCopyStableId() {
  tooltip.value.onCopyStableId?.();
}

function openModal() {
  if (!tooltip.value.visible || !tooltip.value.pinned) {
    return;
  }
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
}

function handleMonsterSpawnerClick(event) {
  if (!event.target.closest('[data-action="save-monster-spawner"]')) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const root = modalOpen.value ? modalMonsterSpawnerRoot.value : monsterSpawnerRoot.value;
  tooltip.value.onSaveMonsterSpawner?.(root);
}

watch(
  () => tooltip.value.version,
  async () => {
    if (!tooltip.value.visible || !tooltip.value.pinned) {
      modalOpen.value = false;
    }
    resetUsecodePreview();
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
  clearUsecodePreviewHideTimer();
  unsubscribe?.();
});
</script>