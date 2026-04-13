<template>
  <div class="atlas-viewer">
    <div class="atlas-toolbar" role="toolbar" aria-label="Atlas viewer controls">
      <div class="atlas-toolbar-summary">
        <div class="atlas-toolbar-title">{{ toolbarTitle }}</div>
        <div class="atlas-toolbar-meta">{{ toolbarMeta }}</div>
      </div>
      <div class="atlas-toolbar-actions">
        <div v-if="viewMode === 'grid'" class="atlas-toolbar-group">
          <button class="atlas-toolbar-button" type="button" :disabled="!hasContent" @click="adjustZoom(-1)">-</button>
          <button class="atlas-toolbar-button" type="button" :disabled="!hasContent" @click="resetZoom">100%</button>
          <button class="atlas-toolbar-button" type="button" :disabled="!hasContent" @click="adjustZoom(1)">+</button>
          <button class="atlas-toolbar-button" type="button" :disabled="!hasContent" @click="fitLayout">Fit</button>
        </div>
        <div class="atlas-toolbar-group atlas-toolbar-view-modes" aria-label="Atlas layout mode">
          <button :class="['atlas-toolbar-button', { 'is-active': viewMode === 'grid' }]" type="button" @click="viewMode = 'grid'">Grid</button>
          <button :class="['atlas-toolbar-button', { 'is-active': viewMode === 'list' }]" type="button" @click="viewMode = 'list'">List</button>
        </div>
      </div>
    </div>

    <div v-if="viewMode === 'list'" class="atlas-filter-bar" role="toolbar" aria-label="Atlas filters">
      <label class="atlas-filter-field atlas-filter-search">
        <span class="atlas-filter-label">Search</span>
        <input v-model.trim="searchQuery" class="atlas-filter-input" type="search" placeholder="Filter by name, shape, family, or description">
      </label>
      <label class="atlas-filter-field">
        <span class="atlas-filter-label">Family</span>
        <select v-model="familyFilter" class="atlas-filter-input">
          <option value="all">All families</option>
          <option v-for="option in familyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="atlas-filter-field">
        <span class="atlas-filter-label">Kind</span>
        <select v-model="kindFilter" class="atlas-filter-input">
          <option value="all">All kinds</option>
          <option v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>

    <div class="atlas-body">
      <div
        v-if="viewMode === 'grid'"
        ref="viewport"
        class="viewport atlas-viewport"
        :class="{ 'is-dragging': Boolean(dragState) }"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @pointerleave="handlePointerLeave"
        @wheel.prevent="handleWheel"
      >
        <div class="viewport-hint atlas-viewport-hint">Drag to pan. Scroll to zoom. Click a sprite to pin its catalog details.</div>
        <canvas ref="canvas" class="scene-canvas atlas-canvas" aria-label="Atlas viewer canvas"></canvas>
        <div v-if="surfaceMessage" class="empty-state">{{ surfaceMessage }}</div>
      </div>

      <section v-else ref="listPanel" class="atlas-list-panel">
        <div v-if="surfaceMessage" class="empty-state atlas-list-empty">{{ surfaceMessage }}</div>
        <div v-else class="atlas-list-wrap">
          <table class="atlas-list-table">
            <thead>
              <tr>
                <th scope="col">Preview</th>
                <th scope="col">Name</th>
                <th scope="col">Shape</th>
                <th scope="col">Frame</th>
                <th scope="col">Family</th>
                <th scope="col">Kind</th>
                <th scope="col">Sprite</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in listRows"
                :key="row.sprite.id"
                :class="['atlas-list-row', { 'is-hover': hoverSpriteId === row.sprite.id }]"
                @mouseenter="handleListRowEnter(row.sprite.id)"
                @mouseleave="handleListRowLeave"
                @click="openModalForSprite(row.sprite.id)"
              >
                <td>
                  <div
                    class="atlas-list-preview-frame"
                    @mouseenter="showListMiniPreview($event, row)"
                    @mousemove="moveListMiniPreview($event)"
                    @mouseleave="hideListMiniPreview"
                  >
                    <div class="atlas-list-preview-sprite" :style="getListPreviewStyle(row)"></div>
                  </div>
                </td>
                <td>{{ row.displayName }}</td>
                <td>{{ row.shapeCode }}</td>
                <td>{{ row.sprite.frame }}</td>
                <td>{{ row.familyLabel }}</td>
                <td>{{ row.definition.kind || '-' }}</td>
                <td>{{ row.sprite.width }} × {{ row.sprite.height }}</td>
                <td class="atlas-list-description">{{ row.displayDescription || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside
        v-if="tooltip.visible"
        ref="tooltipElement"
        :class="['overlay-tooltip', { 'is-hover': !tooltip.pinned, 'is-pinned': tooltip.pinned }]"
        :style="tooltipStyle"
        @click.stop
      >
        <form v-if="tooltip.pinned && canEditCurrentCatalog" class="tooltip-editor-form tooltip-editor-inline overlay-tooltip-scroll" @submit.prevent="handleSaveCatalog">
          <div class="tooltip-preview">
            <canvas ref="previewCanvas" class="tooltip-preview-canvas" aria-label="Selected atlas sprite preview"></canvas>
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
              <button class="tooltip-action" type="button" title="Open modal detail" @click.stop="openModalForSprite(tooltip.spriteId)">Open</button>
              <button class="tooltip-action tooltip-copy-id-button" type="button" title="Copy shape code" @click.stop="copyShapeCode(tooltip.shapeCode)">ID</button>
              <button class="tooltip-action" type="button" title="Close pinned atlas tooltip" @click.stop="clearPinnedSelection">×</button>
            </div>
          </div>
          <dl class="tooltip-grid" v-html="tooltip.metadataRowsHtml"></dl>
          <dl class="tooltip-grid">
            <dt>3D Surface</dt>
            <dd class="tooltip-grid-control">
              <label class="tooltip-field tooltip-grid-field">
                <span class="tooltip-grid-field-label">3D surface type</span>
                <select v-model="form.surfaceType" class="tooltip-field-input" name="surfaceType">
                  <option value="">Auto</option>
                  <option value="floor">Floor</option>
                  <option value="wall">Wall</option>
                  <option value="object">Object</option>
                </select>
              </label>
            </dd>
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
          <label class="tooltip-field">
            <span>Description</span>
            <textarea v-model="form.description" class="tooltip-field-textarea" name="description" rows="4"></textarea>
          </label>
          <p v-if="tooltip.displayDescription" class="muted">{{ tooltip.displayDescription }}</p>
          <p class="tooltip-editor-note">Writes directly to the local CSV for {{ currentGameLabel || currentGameId || "the current game" }}.</p>
          <button class="tooltip-save-button" type="submit" :disabled="savingCatalog">{{ savingCatalog ? "Saving..." : "Save Catalog Entry" }}</button>
        </form>

        <div v-else class="overlay-tooltip-scroll">
          <div class="tooltip-preview">
            <canvas ref="previewCanvas" class="tooltip-preview-canvas" aria-label="Selected atlas sprite preview"></canvas>
          </div>
          <div class="tooltip-header">
            <div class="tooltip-header-main">
              <div class="tooltip-eyebrow">{{ tooltip.itemLabel }}</div>
              <div class="tooltip-field tooltip-title-field tooltip-title-static-field">
                <span>Name</span>
                <div class="tooltip-title tooltip-title-static">{{ tooltip.displayName }}</div>
              </div>
            </div>
            <div class="tooltip-actions">
              <button v-if="tooltip.pinned" class="tooltip-action" type="button" title="Open modal detail" @click.stop="openModalForSprite(tooltip.spriteId)">Open</button>
              <button class="tooltip-action tooltip-copy-id-button" type="button" title="Copy shape code" @click.stop="copyShapeCode(tooltip.shapeCode)">ID</button>
              <button v-if="tooltip.pinned" class="tooltip-action" type="button" title="Close pinned atlas tooltip" @click.stop="clearPinnedSelection">×</button>
            </div>
          </div>
          <dl class="tooltip-grid" v-html="tooltip.metadataRowsHtml"></dl>
          <p v-if="tooltip.displayDescription" class="muted">{{ tooltip.displayDescription }}</p>
          <p v-if="tooltip.pinned && !canEditCurrentCatalog" class="tooltip-editor-note">Catalog editing is only available in admin mode.</p>
        </div>
      </aside>

      <div v-if="modalRecord" class="atlas-modal-backdrop" @click="closeModal"></div>

      <aside
        v-if="modalRecord"
        ref="modalElement"
        class="overlay-tooltip is-pinned is-modal atlas-detail-modal"
        @click.stop
      >
        <form v-if="canEditActiveCatalog" class="tooltip-editor-form tooltip-editor-inline overlay-tooltip-scroll atlas-modal-layout" @submit.prevent="handleSaveCatalog">
          <div class="atlas-modal-primary">
            <div class="tooltip-preview atlas-modal-preview">
              <canvas ref="modalPreviewCanvas" class="tooltip-preview-canvas" aria-label="Selected atlas sprite preview"></canvas>
            </div>
            <div class="tooltip-header atlas-modal-header">
              <div class="tooltip-header-main">
                <div class="tooltip-eyebrow">{{ modalRecord.atlas?.id || modalRecord.sprite.atlasId }} · frame {{ modalRecord.sprite.frame }}</div>
                <label class="tooltip-field tooltip-title-field">
                  <span>Name</span>
                  <input
                    v-model="form.humanReadableId"
                    class="tooltip-field-input tooltip-title-input"
                    name="humanReadableId"
                    type="text"
                    maxlength="120"
                    :placeholder="modalRecord.displayName"
                  >
                </label>
              </div>
              <div class="tooltip-actions">
                <button class="tooltip-action tooltip-copy-id-button" type="button" title="Copy shape code" @click.stop="copyShapeCode(modalRecord.definition.shapeHex || modalRecord.definition.id || '')">ID</button>
                <button class="tooltip-action" type="button" title="Close modal" @click.stop="closeModal">×</button>
              </div>
            </div>
          </div>
          <div class="atlas-modal-secondary">
            <dl class="tooltip-grid" v-html="buildTooltipMetadata(modalRecord)"></dl>
            <dl class="tooltip-grid">
              <dt>3D Surface</dt>
              <dd class="tooltip-grid-control">
                <label class="tooltip-field tooltip-grid-field">
                  <span class="tooltip-grid-field-label">3D surface type</span>
                  <select v-model="form.surfaceType" class="tooltip-field-input" name="surfaceType">
                    <option value="">Auto</option>
                    <option value="floor">Floor</option>
                    <option value="wall">Wall</option>
                    <option value="object">Object</option>
                  </select>
                </label>
              </dd>
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
            <label class="tooltip-field">
              <span>Description</span>
              <textarea v-model="form.description" class="tooltip-field-textarea" name="description" rows="4"></textarea>
            </label>
            <p v-if="modalRecord.displayDescription" class="muted">{{ modalRecord.displayDescription }}</p>
            <p class="tooltip-editor-note">Writes directly to the local CSV for {{ currentGameLabel || currentGameId || "the current game" }}.</p>
            <button class="tooltip-save-button" type="submit" :disabled="savingCatalog">{{ savingCatalog ? "Saving..." : "Save Catalog Entry" }}</button>
          </div>
        </form>

        <div v-else class="overlay-tooltip-scroll atlas-modal-layout">
          <div class="atlas-modal-primary">
            <div class="tooltip-preview atlas-modal-preview">
              <canvas ref="modalPreviewCanvas" class="tooltip-preview-canvas" aria-label="Selected atlas sprite preview"></canvas>
            </div>
            <div class="tooltip-header atlas-modal-header">
              <div class="tooltip-header-main">
                <div class="tooltip-eyebrow">{{ modalRecord.atlas?.id || modalRecord.sprite.atlasId }} · frame {{ modalRecord.sprite.frame }}</div>
                <div class="tooltip-field tooltip-title-field tooltip-title-static-field">
                  <span>Name</span>
                  <div class="tooltip-title tooltip-title-static">{{ modalRecord.displayName }}</div>
                </div>
              </div>
              <div class="tooltip-actions">
                <button class="tooltip-action tooltip-copy-id-button" type="button" title="Copy shape code" @click.stop="copyShapeCode(modalRecord.definition.shapeHex || modalRecord.definition.id || '')">ID</button>
                <button class="tooltip-action" type="button" title="Close modal" @click.stop="closeModal">×</button>
              </div>
            </div>
          </div>
          <div class="atlas-modal-secondary">
            <dl class="tooltip-grid" v-html="buildTooltipMetadata(modalRecord)"></dl>
            <p v-if="modalRecord.displayDescription" class="muted">{{ modalRecord.displayDescription }}</p>
            <p class="tooltip-editor-note">Catalog editing is only available in admin mode.</p>
          </div>
        </div>
      </aside>

      <div v-if="listMiniPreview.visible" class="atlas-mini-preview" :style="listMiniPreviewStyle">
        <div class="atlas-mini-preview-scroll">
          <div class="atlas-mini-preview-image" :style="listMiniPreviewImageStyle"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  appUrl,
  canEditCatalog,
  decodeCatalogBoolean,
  encodeCatalogBoolean,
  escapeHtml,
  fetchJson
} from "../../public/helpers.js";
import { loadImage } from "../../public/scene-api.js";
import { state, DEVICE_PIXEL_RATIO } from "../controller/state.js";
import {
  getCatalogUpdatePath,
  getReferenceAtlasPath,
  getReferenceDataPath
} from "../../shared/runtime-adapter.js";

const ATLAS_STATE_EVENT = "crusader-map-renderer:scene-changed";
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 12;
const ZOOM_FACTOR = 1.2;
const LAYOUT_PADDING = 40;
const ATLAS_GAP = 56;
const LABEL_HEIGHT = 28;
const MAX_ROW_WIDTH = 4096;

const viewport = ref(null);
const listPanel = ref(null);
const canvas = ref(null);
const previewCanvas = ref(null);
const modalPreviewCanvas = ref(null);
const tooltipElement = ref(null);
const modalElement = ref(null);

const loading = ref(false);
const errorMessage = ref("");
const currentGameId = ref("");
const currentGameLabel = ref("");
const currentReferenceId = ref("");
const atlasEntries = ref([]);
const atlasImages = ref(new Map());
const spriteIndex = ref(new Map());
const shapeDefinitionIndex = ref(new Map());
const layout = ref({ entries: [], spriteRects: new Map(), width: 0, height: 0 });
const hoverSpriteId = ref("");
const pinnedSpriteId = ref("");
const modalSpriteId = ref("");
const zoom = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const viewMode = ref("grid");
const searchQuery = ref("");
const familyFilter = ref("all");
const kindFilter = ref("all");
const savingCatalog = ref(false);
const definitionRevision = ref(0);

const tooltip = reactive({
  visible: false,
  pinned: false,
  itemLabel: "",
  displayName: "",
  displayDescription: "",
  metadataRowsHtml: "",
  shapeCode: "",
  spriteId: "",
  left: 16,
  top: 16
});

const form = reactive({
  humanReadableId: "",
  description: "",
  surfaceType: "",
  roof: "",
  semitransparency: "",
  oob: ""
});

const listMiniPreview = reactive({
  visible: false,
  left: 24,
  top: 24,
  row: null
});

const referenceDataCache = new Map();
const imageCache = new Map();
let renderFrame = 0;
const dragState = ref(null);

const hasContent = computed(() => layout.value.entries.length > 0);
const canEditCurrentCatalog = computed(() => canEditCatalog() && Boolean(currentGameId.value) && Boolean(pinnedSpriteId.value));
const canEditActiveCatalog = computed(() => canEditCatalog() && Boolean(currentGameId.value) && Boolean(activeRecord.value));
const focusedSpriteId = computed(() => pinnedSpriteId.value || hoverSpriteId.value || "");
const focusedRecord = computed(() => {
  definitionRevision.value;
  const spriteId = focusedSpriteId.value;
  if (!spriteId) {
    return null;
  }
  const sprite = spriteIndex.value.get(spriteId) ?? null;
  const spriteRect = layout.value.spriteRects.get(spriteId) ?? null;
  const definition = sprite ? shapeDefinitionIndex.value.get(`shape:${sprite.shape}`) ?? null : null;
  if (!sprite || !definition || !spriteRect) {
    return null;
  }
  const atlas = atlasEntries.value.find((entry) => entry.id === sprite.atlasId) ?? null;
  return {
    sprite,
    spriteRect,
    definition,
    atlas,
    displayName: getDefinitionDisplayName(definition),
    displayDescription: getDefinitionDisplayDescription(definition)
  };
});

const modalRecord = computed(() => {
  definitionRevision.value;
  const spriteId = modalSpriteId.value;
  if (!spriteId) {
    return null;
  }
  const sprite = spriteIndex.value.get(spriteId) ?? null;
  const definition = sprite ? shapeDefinitionIndex.value.get(`shape:${sprite.shape}`) ?? null : null;
  const atlas = sprite ? atlasEntries.value.find((entry) => entry.id === sprite.atlasId) ?? null : null;
  if (!sprite || !definition || !atlas) {
    return null;
  }
  return {
    sprite,
    definition,
    atlas,
    displayName: getDefinitionDisplayName(definition),
    displayDescription: getDefinitionDisplayDescription(definition),
    familyLabel: formatFamilyLabel(definition.family)
  };
});

const activeRecord = computed(() => modalRecord.value ?? focusedRecord.value);

const toolbarTitle = computed(() => {
  if (!currentGameLabel.value) {
    return "Atlas Viewer";
  }
  return `${currentGameLabel.value} Atlases`;
});

const toolbarMeta = computed(() => {
  if (loading.value) {
    return "Loading shared reference atlases...";
  }
  if (!hasContent.value) {
    return "No atlas data loaded yet.";
  }
  return `${listRows.value.length} sprite frame${listRows.value.length === 1 ? "" : "s"} shown · ${atlasEntries.value.length} atlas${atlasEntries.value.length === 1 ? "" : "es"} loaded`;
});

const familyOptions = computed(() => {
  const seen = new Map();
  for (const row of allRows.value) {
    seen.set(String(row.definition.family ?? "unknown"), row.familyLabel);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
});

const kindOptions = computed(() => {
  const seen = new Set();
  for (const row of allRows.value) {
    if (row.definition.kind) {
      seen.add(row.definition.kind);
    }
  }
  return [...seen]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
});

const surfaceMessage = computed(() => {
  if (loading.value) {
    return `Loading atlases for ${currentGameLabel.value || "the current game"}...`;
  }
  if (errorMessage.value) {
    return errorMessage.value;
  }
  if (!allRows.value.length) {
    return "Build or load a map first to inspect that game's shared atlases.";
  }
  if (!listRows.value.length) {
    return "No atlas entries match the current filters.";
  }
  return "";
});

const allRows = computed(() => {
  definitionRevision.value;
  const rows = [];
  for (const sprite of spriteIndex.value.values()) {
    const definition = shapeDefinitionIndex.value.get(`shape:${sprite.shape}`);
    const atlas = atlasEntries.value.find((entry) => entry.id === sprite.atlasId);
    if (!definition || !atlas) {
      continue;
    }
    rows.push({
      sprite,
      definition,
      atlas,
      displayName: getDefinitionDisplayName(definition),
      displayDescription: getDefinitionDisplayDescription(definition),
      shapeCode: definition.shapeHex || definition.id || "-",
      familyLabel: formatFamilyLabel(definition.family),
      searchText: [
        getDefinitionDisplayName(definition),
        getDefinitionDisplayDescription(definition),
        definition.shapeHex,
        definition.id,
        formatFamilyLabel(definition.family),
        definition.kind
      ].filter(Boolean).join(" ").toLowerCase()
    });
  }
  return rows.sort((left, right) => left.definition.shape - right.definition.shape || left.sprite.frame - right.sprite.frame || left.sprite.id.localeCompare(right.sprite.id));
});

const listRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return allRows.value.filter((row) => {
    if (familyFilter.value !== "all" && String(row.definition.family ?? "unknown") !== familyFilter.value) {
      return false;
    }
    if (kindFilter.value !== "all" && String(row.definition.kind ?? "") !== kindFilter.value) {
      return false;
    }
    if (query && !row.searchText.includes(query)) {
      return false;
    }
    return true;
  });
});

const listMiniPreviewStyle = computed(() => ({
  left: `${listMiniPreview.left}px`,
  top: `${listMiniPreview.top}px`
}));

const listMiniPreviewImageStyle = computed(() => {
  const row = listMiniPreview.row;
  if (!row) {
    return {};
  }
  const atlasImage = atlasImages.value.get(row.atlas.id);
  if (!atlasImage) {
    return {};
  }
  const atlasWidth = atlasImage.naturalWidth || atlasImage.width;
  const atlasHeight = atlasImage.naturalHeight || atlasImage.height;
  return {
    width: `${row.sprite.width}px`,
    height: `${row.sprite.height}px`,
    backgroundImage: `url(${atlasImage.src})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `${-row.sprite.x}px ${-row.sprite.y}px`,
    backgroundSize: `${atlasWidth}px ${atlasHeight}px`
  };
});

const tooltipStyle = computed(() => {
  if (tooltip.pinned) {
    return {};
  }
  return {
    left: `${tooltip.left}px`,
    top: `${tooltip.top}px`,
    right: "auto",
    bottom: "auto"
  };
});

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function formatFamilyLabel(family) {
  const numericFamily = Number.isInteger(family) ? family : Number.parseInt(String(family ?? ""), 10);
  if (!Number.isInteger(numericFamily)) {
    return "Unknown family";
  }
  const knownFamilies = {
    1: "Family 1 - Crus-type NPC lane",
    3: "Family 3 - Glob egg",
    4: "Family 4 - Usecode trigger egg",
    6: "Family 6 - Non-Crus NPC lane",
    7: "Family 7 - Monster spawn egg",
    8: "Family 8 - Teleport egg",
    13: "Family 13 - Inventory item"
  };
  return knownFamilies[numericFamily] ?? `Family ${numericFamily}`;
}

function getDefinitionDisplayName(definition) {
  const catalogName = String(definition?.catalogEntry?.humanReadableId ?? "").trim();
  return catalogName || definition?.displayName || definition?.shapeHex || definition?.id || "Unknown shape";
}

function getDefinitionDisplayDescription(definition) {
  const catalogDescription = String(definition?.catalogEntry?.description ?? "").trim();
  return catalogDescription || String(definition?.description ?? "").trim();
}

function buildAtlasLayout(atlases, sprites) {
  const spritesByAtlas = new Map();
  for (const sprite of sprites) {
    const atlasSpriteList = spritesByAtlas.get(sprite.atlasId) ?? [];
    atlasSpriteList.push(sprite);
    spritesByAtlas.set(sprite.atlasId, atlasSpriteList);
  }

  let nextX = LAYOUT_PADDING;
  let nextY = LAYOUT_PADDING;
  let rowHeight = 0;
  let maxRight = LAYOUT_PADDING;
  const entries = [];
  const spriteRects = new Map();

  for (const atlas of atlases) {
    const blockWidth = atlas.width;
    const blockHeight = LABEL_HEIGHT + atlas.height;
    if (nextX > LAYOUT_PADDING && nextX + blockWidth > MAX_ROW_WIDTH) {
      nextX = LAYOUT_PADDING;
      nextY += rowHeight + ATLAS_GAP;
      rowHeight = 0;
    }

    const imageTop = nextY + LABEL_HEIGHT;
    const atlasSprites = spritesByAtlas.get(atlas.id) ?? [];
    if (!atlasSprites.length) {
      continue;
    }
    for (const sprite of atlasSprites) {
      spriteRects.set(sprite.id, {
        left: nextX + sprite.x,
        top: imageTop + sprite.y,
        width: sprite.width,
        height: sprite.height
      });
    }

    entries.push({
      atlas,
      sprites: atlasSprites,
      labelLeft: nextX,
      labelTop: nextY,
      imageLeft: nextX,
      imageTop,
      width: atlas.width,
      height: atlas.height
    });

    nextX += blockWidth + ATLAS_GAP;
    rowHeight = Math.max(rowHeight, blockHeight);
    maxRight = Math.max(maxRight, nextX - ATLAS_GAP);
  }

  const totalHeight = entries.length === 0
    ? 0
    : nextY + rowHeight + LAYOUT_PADDING;

  return {
    entries,
    spriteRects,
    width: Math.max(maxRight + LAYOUT_PADDING, 0),
    height: totalHeight
  };
}

function resizeCanvas() {
  if (!canvas.value || !viewport.value) {
    return false;
  }
  const width = Math.max(1, Math.round(viewport.value.clientWidth * DEVICE_PIXEL_RATIO));
  const height = Math.max(1, Math.round(viewport.value.clientHeight * DEVICE_PIXEL_RATIO));
  if (canvas.value.width !== width || canvas.value.height !== height) {
    canvas.value.width = width;
    canvas.value.height = height;
    return true;
  }
  return false;
}

function scenePointFromClient(clientX, clientY) {
  const rect = viewport.value?.getBoundingClientRect();
  if (!rect) {
    return null;
  }
  return {
    x: (clientX - rect.left - offsetX.value) / zoom.value,
    y: (clientY - rect.top - offsetY.value) / zoom.value
  };
}

function viewportRectFromSpriteRect(spriteRect) {
  return {
    left: spriteRect.left * zoom.value + offsetX.value,
    top: spriteRect.top * zoom.value + offsetY.value,
    width: spriteRect.width * zoom.value,
    height: spriteRect.height * zoom.value
  };
}

function findSpriteAtPoint(point) {
  if (!point) {
    return null;
  }
  for (const entry of layout.value.entries) {
    if (
      point.x < entry.imageLeft
      || point.x >= entry.imageLeft + entry.width
      || point.y < entry.imageTop
      || point.y >= entry.imageTop + entry.height
    ) {
      continue;
    }
    for (const sprite of entry.sprites) {
      const spriteRect = layout.value.spriteRects.get(sprite.id);
      if (!spriteRect) {
        continue;
      }
      if (
        point.x >= spriteRect.left
        && point.x < spriteRect.left + spriteRect.width
        && point.y >= spriteRect.top
        && point.y < spriteRect.top + spriteRect.height
      ) {
        return sprite;
      }
    }
  }
  return null;
}

function syncFormFromFocusedRecord() {
  const definition = activeRecord.value?.definition ?? null;
  form.humanReadableId = String(definition?.catalogEntry?.humanReadableId ?? "");
  form.description = String(definition?.catalogEntry?.description ?? "");
  form.surfaceType = String(definition?.catalogEntry?.surfaceType ?? "");
  form.roof = encodeCatalogBoolean(definition?.catalogEntry?.roof ?? null);
  form.semitransparency = encodeCatalogBoolean(definition?.catalogEntry?.semitransparency ?? null);
  form.oob = encodeCatalogBoolean(definition?.catalogEntry?.oob ?? null);
}

function buildTooltipMetadata(record) {
  const traits = [];
  if (record.definition?.traits?.roof) {
    traits.push("roof");
  }
  if (record.definition?.traits?.editor) {
    traits.push("editor");
  }
  if (record.definition?.traits?.oob) {
    traits.push("oob");
  }
  if (record.definition?.traits?.translucent) {
    traits.push("translucent");
  }
  const dimensions = record.definition?.dimensions;
  const dimensionText = dimensions
    ? `${dimensions.x ?? "-"} × ${dimensions.y ?? "-"} × ${dimensions.z ?? "-"}`
    : "-";
  return `
    <dt>Shape</dt><dd>${escapeHtml(record.definition.shapeHex || record.definition.id || "-")}</dd>
    <dt>Frame</dt><dd>${escapeHtml(record.sprite.frame)}</dd>
    <dt>Atlas</dt><dd>${escapeHtml(record.atlas?.id || record.sprite.atlasId)}</dd>
    <dt>Sprite</dt><dd>${escapeHtml(record.sprite.width)} × ${escapeHtml(record.sprite.height)}</dd>
    <dt>Atlas Pos</dt><dd>${escapeHtml(record.sprite.x)}, ${escapeHtml(record.sprite.y)}</dd>
    <dt>Family</dt><dd>${escapeHtml(record.familyLabel ?? formatFamilyLabel(record.definition.family))}</dd>
    <dt>Kind</dt><dd>${escapeHtml(record.definition.kind ?? "-")}</dd>
    <dt>Dims</dt><dd>${escapeHtml(dimensionText)}</dd>
    <dt>Traits</dt><dd>${escapeHtml(traits.length ? traits.join(", ") : "-")}</dd>
  `;
}

function updateTooltip() {
  const record = focusedRecord.value;
  if (!record || viewMode.value !== "grid") {
    tooltip.visible = false;
    return;
  }

  tooltip.visible = true;
  tooltip.pinned = pinnedSpriteId.value === record.sprite.id;
  tooltip.itemLabel = `${record.atlas?.id || record.sprite.atlasId} · frame ${record.sprite.frame}`;
  tooltip.displayName = record.displayName;
  tooltip.displayDescription = record.displayDescription;
  tooltip.metadataRowsHtml = buildTooltipMetadata(record);
  tooltip.shapeCode = record.definition.shapeHex || record.definition.id || "";
  tooltip.spriteId = record.sprite.id;
  if (tooltip.pinned) {
    syncFormFromFocusedRecord();
  }
}

function positionTooltip() {
  if (!tooltip.visible || !tooltipElement.value || !focusedRecord.value || !viewport.value) {
    return;
  }
  if (tooltip.pinned || viewMode.value !== "grid") {
    return;
  }

  const spriteRect = viewportRectFromSpriteRect(focusedRecord.value.spriteRect);
  const tooltipWidth = tooltipElement.value.offsetWidth;
  const tooltipHeight = tooltipElement.value.offsetHeight;
  const padding = 18;
  let left = spriteRect.left + spriteRect.width + 14;
  let top = spriteRect.top + Math.min(spriteRect.height / 2, 48);

  if (left + tooltipWidth + padding > viewport.value.clientWidth) {
    left = Math.max(padding, spriteRect.left - tooltipWidth - 14);
  }
  if (top + tooltipHeight + padding > viewport.value.clientHeight) {
    top = Math.max(padding, viewport.value.clientHeight - tooltipHeight - padding);
  }
  if (top < padding) {
    top = padding;
  }

  tooltip.left = left;
  tooltip.top = top;
}

function renderPreviewIntoCanvas(preview, record) {
  if (!preview) {
    return;
  }
  const previewContext = preview.getContext("2d", { alpha: true });
  if (!previewContext) {
    return;
  }

  const previewSize = 112;
  preview.width = Math.round(previewSize * DEVICE_PIXEL_RATIO);
  preview.height = Math.round(previewSize * DEVICE_PIXEL_RATIO);
  previewContext.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
  previewContext.clearRect(0, 0, previewSize, previewSize);
  previewContext.imageSmoothingEnabled = false;

  if (!record) {
    return;
  }

  const atlasImage = atlasImages.value.get(record.sprite.atlasId) ?? null;
  if (!atlasImage) {
    previewContext.fillStyle = "rgba(176, 197, 212, 0.22)";
    previewContext.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    previewContext.textAlign = "center";
    previewContext.textBaseline = "middle";
    previewContext.fillText("No preview", previewSize / 2, previewSize / 2);
    return;
  }

  const fitScale = Math.min((previewSize - 16) / Math.max(record.sprite.width, 1), (previewSize - 16) / Math.max(record.sprite.height, 1));
  const scale = fitScale >= 1 ? Math.max(1, Math.floor(fitScale)) : fitScale;
  const width = record.sprite.width * scale;
  const height = record.sprite.height * scale;
  const left = (previewSize - width) / 2;
  const top = (previewSize - height) / 2;
  previewContext.drawImage(atlasImage, record.sprite.x, record.sprite.y, record.sprite.width, record.sprite.height, left, top, width, height);
}

function renderPreview() {
  renderPreviewIntoCanvas(previewCanvas.value, focusedRecord.value);
  renderPreviewIntoCanvas(modalPreviewCanvas.value, modalRecord.value);
}

function drawCheckerboard(targetContext, left, top, width, height) {
  const cell = 16;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      targetContext.fillStyle = ((x / cell) + (y / cell)) % 2 === 0
        ? "rgba(255, 255, 255, 0.045)"
        : "rgba(255, 255, 255, 0.02)";
      targetContext.fillRect(left + x, top + y, Math.min(cell, width - x), Math.min(cell, height - y));
    }
  }
}

function drawHighlight(targetContext, spriteId, strokeStyle, fillStyle) {
  const spriteRect = layout.value.spriteRects.get(spriteId);
  if (!spriteRect) {
    return;
  }
  targetContext.save();
  targetContext.lineWidth = Math.max(2 / zoom.value, 1 / zoom.value);
  targetContext.strokeStyle = strokeStyle;
  targetContext.fillStyle = fillStyle;
  targetContext.fillRect(spriteRect.left, spriteRect.top, spriteRect.width, spriteRect.height);
  targetContext.strokeRect(spriteRect.left, spriteRect.top, spriteRect.width, spriteRect.height);
  targetContext.restore();
}

function render() {
  renderFrame = 0;
  if (viewMode.value !== "grid") {
    return;
  }
  if (!canvas.value || !viewport.value) {
    return;
  }
  if (viewport.value.clientWidth === 0 || viewport.value.clientHeight === 0) {
    return;
  }

  resizeCanvas();
  const ctx = canvas.value.getContext("2d", { alpha: true });
  if (!ctx) {
    return;
  }

  ctx.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
  ctx.clearRect(0, 0, viewport.value.clientWidth, viewport.value.clientHeight);
  ctx.fillStyle = "#0a0c12";
  ctx.fillRect(0, 0, viewport.value.clientWidth, viewport.value.clientHeight);

  ctx.save();
  ctx.translate(offsetX.value, offsetY.value);
  ctx.scale(zoom.value, zoom.value);

  for (const entry of layout.value.entries) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fillRect(entry.imageLeft - 1, entry.imageTop - 1, entry.width + 2, entry.height + 2);
    drawCheckerboard(ctx, entry.imageLeft, entry.imageTop, entry.width, entry.height);
    ctx.strokeStyle = "rgba(138, 202, 221, 0.24)";
    ctx.lineWidth = Math.max(1 / zoom.value, 0.75 / zoom.value);
    ctx.strokeRect(entry.imageLeft - 0.5, entry.imageTop - 0.5, entry.width + 1, entry.height + 1);
    ctx.fillStyle = "rgba(226, 236, 246, 0.92)";
    ctx.font = `${Math.max(12 / zoom.value, 10 / zoom.value)}px \"Cascadia Code\", \"Consolas\", monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText(`${entry.atlas.id} · ${entry.width}×${entry.height}`, entry.labelLeft, entry.labelTop + LABEL_HEIGHT / 2);
    const atlasImage = atlasImages.value.get(entry.atlas.id);
    if (atlasImage) {
      ctx.drawImage(atlasImage, entry.imageLeft, entry.imageTop, entry.width, entry.height);
    }
  }

  if (hoverSpriteId.value && hoverSpriteId.value !== pinnedSpriteId.value) {
    drawHighlight(ctx, hoverSpriteId.value, "rgba(255, 229, 107, 0.95)", "rgba(255, 229, 107, 0.12)");
  }
  if (pinnedSpriteId.value) {
    drawHighlight(ctx, pinnedSpriteId.value, "rgba(124, 182, 214, 0.95)", "rgba(124, 182, 214, 0.16)");
  }

  ctx.restore();
  positionTooltip();
}

function scheduleRender() {
  if (renderFrame) {
    return;
  }
  renderFrame = window.requestAnimationFrame(render);
}

function fitLayout() {
  if (!viewport.value || !hasContent.value) {
    return;
  }
  const availableWidth = Math.max(viewport.value.clientWidth - 64, 1);
  const availableHeight = Math.max(viewport.value.clientHeight - 64, 1);
  zoom.value = clampZoom(Math.min(availableWidth / Math.max(layout.value.width, 1), availableHeight / Math.max(layout.value.height, 1)));
  offsetX.value = Math.round((viewport.value.clientWidth - layout.value.width * zoom.value) / 2);
  offsetY.value = Math.round((viewport.value.clientHeight - layout.value.height * zoom.value) / 2);
  scheduleRender();
}

function resetZoom() {
  if (!viewport.value || !hasContent.value) {
    return;
  }
  zoom.value = 1;
  offsetX.value = Math.round((viewport.value.clientWidth - layout.value.width) / 2);
  offsetY.value = Math.round((viewport.value.clientHeight - layout.value.height) / 2);
  scheduleRender();
}

function adjustZoom(direction) {
  if (!viewport.value || !hasContent.value) {
    return;
  }
  const rect = viewport.value.getBoundingClientRect();
  zoomAroundPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR);
}

function zoomAroundPoint(clientX, clientY, factor) {
  const rect = viewport.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }
  const scenePoint = scenePointFromClient(clientX, clientY);
  if (!scenePoint) {
    return;
  }
  const nextZoom = clampZoom(zoom.value * factor);
  offsetX.value = clientX - rect.left - scenePoint.x * nextZoom;
  offsetY.value = clientY - rect.top - scenePoint.y * nextZoom;
  zoom.value = nextZoom;
  scheduleRender();
}

function handleWheel(event) {
  if (!hasContent.value) {
    return;
  }
  const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
  zoomAroundPoint(event.clientX, event.clientY, factor);
}

function handlePointerDown(event) {
  if (!viewport.value || !hasContent.value) {
    return;
  }
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originOffsetX: offsetX.value,
    originOffsetY: offsetY.value,
    moved: false
  };
  viewport.value.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!hasContent.value) {
    return;
  }
  if (dragState.value && dragState.value.pointerId === event.pointerId) {
    const deltaX = event.clientX - dragState.value.startX;
    const deltaY = event.clientY - dragState.value.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragState.value.moved = true;
    }
    offsetX.value = dragState.value.originOffsetX + deltaX;
    offsetY.value = dragState.value.originOffsetY + deltaY;
    scheduleRender();
    return;
  }
  if (pinnedSpriteId.value) {
    return;
  }
  const sprite = findSpriteAtPoint(scenePointFromClient(event.clientX, event.clientY));
  hoverSpriteId.value = sprite?.id ?? "";
  updateTooltip();
  scheduleRender();
}

function releasePointerCapture(pointerId) {
  if (viewport.value?.hasPointerCapture(pointerId)) {
    viewport.value.releasePointerCapture(pointerId);
  }
}

function handlePointerUp(event) {
  if (!hasContent.value) {
    return;
  }
  if (!dragState.value || dragState.value.pointerId !== event.pointerId) {
    releasePointerCapture(event.pointerId);
    return;
  }
  const wasMoved = dragState.value.moved;
  dragState.value = null;
  releasePointerCapture(event.pointerId);
  if (wasMoved) {
    return;
  }
  const sprite = findSpriteAtPoint(scenePointFromClient(event.clientX, event.clientY));
  const nextPinned = sprite?.id ?? "";
  pinnedSpriteId.value = pinnedSpriteId.value === nextPinned ? "" : nextPinned;
  hoverSpriteId.value = pinnedSpriteId.value ? "" : nextPinned;
  updateTooltip();
  scheduleRender();
}

function handlePointerLeave() {
  if (dragState.value || pinnedSpriteId.value) {
    return;
  }
  hoverSpriteId.value = "";
  updateTooltip();
  scheduleRender();
}

function clearPinnedSelection() {
  pinnedSpriteId.value = "";
  updateTooltip();
  scheduleRender();
}

function openModalForSprite(spriteId) {
  modalSpriteId.value = spriteId || "";
}

function closeModal() {
  modalSpriteId.value = "";
}

function handleListRowEnter(spriteId) {
  hoverSpriteId.value = spriteId;
}

function handleListRowLeave() {
  hoverSpriteId.value = "";
}

function positionListMiniPreview(event) {
  const margin = 16;
  const previewWidth = Math.min(window.innerWidth * 0.7, 420);
  const previewHeight = Math.min(window.innerHeight * 0.7, 420);
  listMiniPreview.left = Math.min(event.clientX + 18, window.innerWidth - previewWidth - margin);
  listMiniPreview.top = Math.min(event.clientY + 18, window.innerHeight - previewHeight - margin);
}

function showListMiniPreview(event, row) {
  listMiniPreview.visible = true;
  listMiniPreview.row = row;
  positionListMiniPreview(event);
}

function moveListMiniPreview(event) {
  if (!listMiniPreview.visible) {
    return;
  }
  positionListMiniPreview(event);
}

function hideListMiniPreview() {
  listMiniPreview.visible = false;
  listMiniPreview.row = null;
}

function getListPreviewStyle(row) {
  const atlasImage = atlasImages.value.get(row.atlas.id);
  if (!atlasImage) {
    return {};
  }
  const targetSize = 40;
  const scale = Math.min(targetSize / Math.max(row.sprite.width, 1), targetSize / Math.max(row.sprite.height, 1), 1);
  const width = Math.max(1, Math.round(row.sprite.width * scale));
  const height = Math.max(1, Math.round(row.sprite.height * scale));
  const atlasWidth = atlasImage.naturalWidth || atlasImage.width;
  const atlasHeight = atlasImage.naturalHeight || atlasImage.height;
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url(${atlasImage.src})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `${Math.round(-row.sprite.x * scale)}px ${Math.round(-row.sprite.y * scale)}px`,
    backgroundSize: `${Math.round(atlasWidth * scale)}px ${Math.round(atlasHeight * scale)}px`
  };
}

async function loadReferenceImages(referenceId, atlases) {
  const loadedImages = new Map();
  await Promise.all(atlases.map(async (atlas) => {
    const cacheKey = `${referenceId}:${atlas.id}`;
    if (!imageCache.has(cacheKey)) {
      imageCache.set(cacheKey, loadImage(appUrl(getReferenceAtlasPath(state.siteConfig, referenceId, atlas))));
    }
    loadedImages.set(atlas.id, await imageCache.get(cacheKey));
  }));
  return loadedImages;
}

async function refreshFromControllerState() {
  const selected = state.current?.selected ?? null;
  const scene = state.current?.scene ?? null;
  if (!state.siteConfig || !selected?.game) {
    currentGameId.value = "";
    currentGameLabel.value = "";
    currentReferenceId.value = "";
    atlasEntries.value = [];
    atlasImages.value = new Map();
    spriteIndex.value = new Map();
    shapeDefinitionIndex.value = new Map();
    layout.value = { entries: [], spriteRects: new Map(), width: 0, height: 0 };
    hoverSpriteId.value = "";
    pinnedSpriteId.value = "";
    updateTooltip();
    scheduleRender();
    return;
  }

  const referenceId = scene?.references?.referenceId ?? selected.game;
  currentGameId.value = selected.game;
  currentGameLabel.value = state.catalog?.games?.find((game) => game.id === selected.game)?.label ?? selected.game;
  currentReferenceId.value = referenceId;
  loading.value = true;
  errorMessage.value = "";

  try {
    if (!referenceDataCache.has(referenceId)) {
      referenceDataCache.set(referenceId, fetchJson(appUrl(getReferenceDataPath(state.siteConfig, referenceId))));
    }
    const payload = await referenceDataCache.get(referenceId);
    const nextAtlases = Array.isArray(payload?.atlases) ? payload.atlases : [];
    const nextSprites = Array.isArray(payload?.sprites) ? payload.sprites : [];
    const nextDefinitions = Array.isArray(payload?.shapeDefinitions) ? payload.shapeDefinitions : [];
    atlasEntries.value = nextAtlases;
    atlasImages.value = await loadReferenceImages(referenceId, nextAtlases);
    spriteIndex.value = new Map(nextSprites.map((sprite) => [sprite.id, sprite]));
    shapeDefinitionIndex.value = new Map(nextDefinitions.map((definition) => [definition.id, definition]));
    layout.value = buildAtlasLayout(nextAtlases, listRows.value.map((row) => row.sprite));
    definitionRevision.value += 1;

    if (pinnedSpriteId.value && !spriteIndex.value.has(pinnedSpriteId.value)) {
      pinnedSpriteId.value = "";
    }
    if (hoverSpriteId.value && !spriteIndex.value.has(hoverSpriteId.value)) {
      hoverSpriteId.value = "";
    }

    if (hasContent.value && viewMode.value === "grid") {
      await nextTick();
      resetZoom();
    } else {
      scheduleRender();
    }
    updateTooltip();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    atlasEntries.value = [];
    atlasImages.value = new Map();
    spriteIndex.value = new Map();
    shapeDefinitionIndex.value = new Map();
    layout.value = { entries: [], spriteRects: new Map(), width: 0, height: 0 };
    hoverSpriteId.value = "";
    pinnedSpriteId.value = "";
    updateTooltip();
    scheduleRender();
  } finally {
    loading.value = false;
  }
}

async function handleSaveCatalog() {
  const record = activeRecord.value;
  if (!record || !canEditActiveCatalog.value || savingCatalog.value) {
    return;
  }
  savingCatalog.value = true;
  try {
    const result = await fetchJson(appUrl(getCatalogUpdatePath(currentGameId.value, record.definition.shape)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        humanReadableId: String(form.humanReadableId ?? "").trim(),
        description: String(form.description ?? "").trim(),
        surfaceType: String(form.surfaceType ?? "").trim().toLowerCase(),
        roof: decodeCatalogBoolean(form.roof),
        semitransparency: decodeCatalogBoolean(form.semitransparency),
        oob: decodeCatalogBoolean(form.oob)
      })
    });

    const nextCatalogEntry = {
      humanReadableId: String(result?.entry?.humanReadableId ?? ""),
      description: String(result?.entry?.description ?? ""),
      surfaceType: String(result?.entry?.surfaceType ?? ""),
      roof: result?.entry?.roof ?? null,
      semitransparency: result?.entry?.semitransparency ?? null,
      oob: result?.entry?.oob ?? null
    };
    record.definition.catalogEntry = nextCatalogEntry;
    const currentDefinition = state.current?.shapeDefinitions?.get(record.definition.id) ?? null;
    if (currentDefinition) {
      currentDefinition.catalogEntry = { ...nextCatalogEntry };
    }
    definitionRevision.value += 1;
    updateTooltip();
  } finally {
    savingCatalog.value = false;
  }
}

watch([focusedRecord, viewMode], async () => {
  updateTooltip();
}, { immediate: true });

watch([focusedRecord, modalRecord, () => tooltip.pinned, () => tooltip.visible, viewMode], async () => {
  syncFormFromFocusedRecord();
  await nextTick();
  renderPreview();
  positionTooltip();
}, { immediate: true });

watch([zoom, offsetX, offsetY], async () => {
  await nextTick();
  positionTooltip();
});

watch(listRows, async (rows) => {
  layout.value = buildAtlasLayout(atlasEntries.value, rows.map((row) => row.sprite));
  if (hoverSpriteId.value && !rows.some((row) => row.sprite.id === hoverSpriteId.value)) {
    hoverSpriteId.value = "";
  }
  if (pinnedSpriteId.value && !rows.some((row) => row.sprite.id === pinnedSpriteId.value)) {
    pinnedSpriteId.value = "";
  }
  if (modalSpriteId.value && !rows.some((row) => row.sprite.id === modalSpriteId.value)) {
    modalSpriteId.value = "";
  }
  await nextTick();
  if (viewMode.value === "grid" && rows.length) {
    resetZoom();
  } else {
    scheduleRender();
  }
}, { immediate: false });

watch(viewMode, async (nextMode) => {
  if (nextMode !== "grid") {
    hoverSpriteId.value = "";
    hideListMiniPreview();
    updateTooltip();
  }
  await nextTick();
  if (nextMode === "grid") {
    if (listRows.value.length) {
      resetZoom();
    }
    scheduleRender();
  }
});

function handleWindowResize() {
  if (!hasContent.value) {
    resizeCanvas();
  }
  scheduleRender();
}

onMounted(() => {
  window.addEventListener(ATLAS_STATE_EVENT, refreshFromControllerState);
  window.addEventListener("resize", handleWindowResize);
  void refreshFromControllerState();
  scheduleRender();
});

onUnmounted(() => {
  window.removeEventListener(ATLAS_STATE_EVENT, refreshFromControllerState);
  window.removeEventListener("resize", handleWindowResize);
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
  }
});
</script>

<style scoped>
.atlas-viewer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.atlas-filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: end;
}

.atlas-filter-field {
  display: grid;
  gap: 6px;
  min-width: 180px;
}

.atlas-filter-search {
  flex: 1 1 300px;
}

.atlas-filter-label {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(176, 197, 212, 0.76);
}

.atlas-filter-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(8, 12, 18, 0.45);
  color: rgba(255, 255, 255, 0.92);
  font: inherit;
}

.atlas-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.atlas-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(4, 8, 14, 0.72);
  backdrop-filter: blur(8px);
}

.atlas-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.atlas-toolbar-summary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.atlas-toolbar-title {
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(228, 240, 255, 0.94);
}

.atlas-toolbar-meta {
  color: rgba(176, 197, 212, 0.78);
  font-size: 0.84rem;
}

.atlas-toolbar-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.atlas-toolbar-group {
  display: inline-flex;
  gap: 8px;
}

.atlas-toolbar-button {
  min-width: 54px;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(8, 12, 18, 0.45);
  color: rgba(255, 255, 255, 0.92);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.atlas-toolbar-button.is-active {
  background: linear-gradient(180deg, rgba(13, 108, 125, 0.9) 0%, rgba(8, 76, 92, 0.95) 100%);
  border-color: rgba(124, 182, 214, 0.4);
  color: white;
}

.atlas-toolbar-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(18, 27, 39, 0.85);
  border-color: rgba(138, 202, 221, 0.34);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
}

.atlas-toolbar-button:disabled {
  opacity: 0.5;
}

.atlas-viewport {
  flex: 1;
  min-height: 0;
}

.atlas-list-panel {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(124, 182, 214, 0.18);
  border-radius: 18px;
  background: rgba(8, 12, 18, 0.55);
}

.atlas-list-wrap {
  height: 100%;
  overflow: auto;
}

.atlas-list-empty {
  position: static;
  height: 100%;
}

.atlas-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.atlas-list-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 10px;
  text-align: left;
  background: rgba(8, 12, 18, 0.94);
  color: rgba(176, 197, 212, 0.84);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.atlas-list-row {
  cursor: pointer;
}

.atlas-list-row td {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: middle;
}

.atlas-list-row:hover,
.atlas-list-row.is-hover {
  background: rgba(255, 229, 107, 0.08);
}

.atlas-list-row.is-pinned {
  background: rgba(124, 182, 214, 0.14);
}

.atlas-list-preview-frame {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(138, 202, 221, 0.08), rgba(255, 255, 255, 0.03)),
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.03) 75%),
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
  background-size: auto, 14px 14px, 14px 14px;
  background-position: 0 0, 0 0, 7px 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.atlas-list-preview-sprite {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.atlas-list-description {
  min-width: 240px;
  color: rgba(214, 227, 237, 0.82);
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.atlas-mini-preview {
  position: fixed;
  z-index: 30;
  padding: 12px;
  border-radius: 14px;
  background: rgba(12, 16, 24, 0.96);
  border: 1px solid rgba(138, 202, 221, 0.24);
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(16px);
  pointer-events: none;
}

.atlas-mini-preview-scroll {
  max-width: min(70vw, 420px);
  max-height: min(70vh, 420px);
  overflow: auto;
}

.atlas-mini-preview-image {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.overlay-tooltip.is-modal {
  position: fixed;
  z-index: 50;
  left: 50%;
  right: auto;
  top: 24px;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(1080px, calc(100vw - 48px));
  max-width: min(1080px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  padding: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.42);
}

.overlay-tooltip.is-modal .overlay-tooltip-scroll,
.overlay-tooltip.is-modal .tooltip-editor-form {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
  padding-bottom: 12px;
}

.overlay-tooltip.is-pinned:not(.is-modal) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.overlay-tooltip.is-pinned:not(.is-modal) .overlay-tooltip-scroll,
.overlay-tooltip.is-pinned:not(.is-modal) .tooltip-editor-form {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  padding-bottom: 12px;
}

.overlay-tooltip.is-modal .tooltip-preview-canvas {
  width: 160px;
  height: 160px;
}

.overlay-tooltip.is-modal .tooltip-title-input,
.overlay-tooltip.is-modal .tooltip-title-static {
  font-size: 1.08rem;
}

.atlas-modal-layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.atlas-modal-primary,
.atlas-modal-secondary {
  min-width: 0;
}

.atlas-modal-primary {
  position: sticky;
  top: 0;
  display: grid;
  gap: 16px;
  align-content: start;
}

.atlas-modal-preview {
  margin-bottom: 0;
}

.atlas-modal-header {
  margin-bottom: 0;
}

.overlay-tooltip.is-modal .tooltip-grid {
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr);
}

.overlay-tooltip.is-modal .tooltip-grid dd {
  text-align: left;
}

.overlay-tooltip.is-modal .tooltip-field-textarea {
  min-height: 140px;
}

.atlas-canvas {
  cursor: grab;
}

.atlas-viewport.is-dragging .atlas-canvas {
  cursor: grabbing;
}

.atlas-viewport-hint {
  max-width: min(100% - 32px, 680px);
}

@media (max-width: 820px) {
  .atlas-toolbar {
    align-items: stretch;
  }

  .atlas-toolbar-actions {
    width: 100%;
    justify-content: space-between;
  }

  .atlas-toolbar-group {
    flex: 1;
    justify-content: space-between;
  }

  .atlas-toolbar-button {
    flex: 1;
  }

  .atlas-filter-field {
    min-width: 0;
    flex: 1 1 100%;
  }

  .atlas-list-description {
    min-width: 160px;
  }

  .overlay-tooltip.is-modal {
    top: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    padding: 16px;
  }

  .overlay-tooltip.is-modal .tooltip-preview-canvas {
    width: 128px;
    height: 128px;
  }

  .atlas-modal-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .atlas-modal-primary {
    position: static;
  }
}
</style>