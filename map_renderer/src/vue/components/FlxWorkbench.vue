<template>
  <section class="flx-workbench">
    <header class="flx-header">
      <div class="flx-heading-row">
        <div class="flx-title-group">
          <h1>FLX</h1>
          <span>{{ activeArchiveSummary }}</span>
        </div>
        <span v-if="activeDirty" class="flx-dirty" role="status">Modified</span>
        <span v-else-if="activeLoaded" class="flx-clean" role="status">Unmodified</span>
      </div>
      <div class="flx-controls">
        <div class="flx-mode-tabs" role="tablist" aria-label="Archive type">
          <button :class="{ 'is-active': activeMode === 'glob' }" type="button" role="tab" :aria-selected="activeMode === 'glob'" @click="activeMode = 'glob'">GLOB</button>
          <button :class="{ 'is-active': activeMode === 'fixed' }" type="button" role="tab" :aria-selected="activeMode === 'fixed'" @click="activeMode = 'fixed'">FIXED</button>
        </div>
        <input ref="globFileInput" class="flx-file-input" type="file" accept=".flx" @change="handleGlobUpload">
        <input ref="fixedFileInput" class="flx-file-input" type="file" accept=".dat" @change="handleFixedUpload">
        <button v-if="activeMode === 'glob'" class="flx-action" type="button" @click="globFileInput?.click()">{{ globArchive ? 'Replace GLOB.FLX' : 'Load GLOB.FLX' }}</button>
        <button v-else class="flx-action" type="button" @click="fixedFileInput?.click()">{{ fixedArchive ? 'Replace FIXED.DAT' : 'Load FIXED.DAT' }}</button>
        <button v-if="activeMode === 'glob' && globArchive" class="flx-action flx-action-quiet" type="button" @click="clearGlobArchive">Clear</button>
        <button v-if="activeMode === 'fixed' && fixedArchive" class="flx-action flx-action-quiet" type="button" @click="clearFixedArchive">Clear</button>
      </div>
      <div class="flx-drop-target" @dragover.prevent @drop.prevent="handleFileDrop">Drop a .FLX or .DAT archive</div>
      <div v-if="errorMessage" class="flx-error" role="alert">{{ errorMessage }}</div>
    </header>

    <div v-if="activeMode === 'glob'" class="flx-archive-actions">
      <template v-if="globArchive">
        <span class="flx-file-name" :title="globArchive.fileName">{{ globArchive.fileName }}</span>
        <span class="flx-action-spacer"></span>
        <button class="flx-action flx-action-quiet" type="button" :disabled="!globUndoStack.length" title="Undo GLOB edit" @click="undoGlobEdit">Undo</button>
        <button class="flx-action flx-action-quiet" type="button" :disabled="!globRedoStack.length" title="Redo GLOB edit" @click="redoGlobEdit">Redo</button>
        <button class="flx-action" type="button" title="Append a stable new slot" @click="addGlobSlot">Add slot</button>
        <button class="flx-action flx-action-danger" type="button" :disabled="selectedGlobIndex === null" @click="removeGlobSlot">Empty slot</button>
        <button class="flx-action flx-action-download" type="button" :disabled="!globDirty" @click="downloadGlobArchive">Download edited archive</button>
      </template>
      <span v-else class="flx-inline-hint">Load a GLOB archive to inspect its slots.</span>
    </div>

    <div v-if="activeMode === 'glob' && selectedGlobSlot?.isNew" class="flx-new-child-form">
      <strong>New slot {{ formatIndex(selectedGlobSlot.index) }}</strong>
      <label>X <input v-model.number="newChild.x" type="number" min="0" max="255"></label>
      <label>Y <input v-model.number="newChild.y" type="number" min="0" max="255"></label>
      <label>Z <input v-model.number="newChild.z" type="number" min="0" max="255"></label>
      <label>Shape <input v-model.number="newChild.shape" type="number" min="0" max="65535"></label>
      <label>Frame <input v-model.number="newChild.frame" type="number" min="0" max="255"></label>
      <button class="flx-action" type="button" @click="addGlobChild">Add descriptor</button>
    </div>

    <div v-if="activeMode === 'glob'" class="flx-content">
      <GlobViewer
        v-if="globArchive"
        :archive-source="globViewerSource"
        :selected-entry-index="selectedGlobIndex"
        @entry-selected="selectedGlobIndex = $event"
      />
      <div v-else class="flx-empty-state">
        <h2>No GLOB archive loaded</h2>
        <p>Choose a GLOB.FLX file to inspect its slots and descriptors.</p>
      </div>
    </div>

    <div v-if="activeMode === 'fixed'" class="flx-archive-actions">
      <template v-if="fixedArchive">
        <span class="flx-file-name" :title="fixedArchive.fileName">{{ fixedArchive.fileName }}</span>
        <span class="flx-action-spacer"></span>
        <button class="flx-action flx-action-quiet" type="button" :disabled="!fixedUndoStack.length" title="Undo FIXED edit" @click="undoFixedEdit">Undo</button>
        <button class="flx-action flx-action-quiet" type="button" :disabled="!fixedRedoStack.length" title="Redo FIXED edit" @click="redoFixedEdit">Redo</button>
        <input ref="mapPayloadInput" class="flx-file-input" type="file" accept=".json,.bin,application/json,application/octet-stream" @change="handleMapPayloadImport">
        <button class="flx-action" type="button" :disabled="selectedMapIndex === null" @click="mapPayloadInput?.click()">Replace map payload</button>
        <button v-if="selectedMap?.dirty" class="flx-action flx-action-quiet" type="button" @click="restoreFixedMap">Restore slot</button>
        <button class="flx-action flx-action-download" type="button" :disabled="!fixedDirty" @click="downloadFixedArchive">Download edited archive</button>
      </template>
      <span v-else class="flx-inline-hint">Load a FIXED archive to inspect its map slots.</span>
    </div>

    <div v-if="activeMode === 'fixed'" class="flx-content flx-fixed-content">
      <template v-if="fixedArchive">
        <aside class="flx-slot-sidebar" aria-label="FIXED map slots">
          <div class="flx-slot-heading"><strong>Map slots</strong><span>{{ fixedSlots.length }}</span></div>
          <div class="flx-slot-list" role="listbox" aria-label="FIXED map slots">
            <button
              v-for="slot in fixedSlots"
              :key="slot.index"
              :class="['flx-slot-option', { 'is-selected': selectedMapIndex === slot.index }]"
              type="button"
              role="option"
              :aria-selected="selectedMapIndex === slot.index"
              @click="selectedMapIndex = slot.index"
            >
              <span class="flx-slot-index">Map {{ slot.index }}</span>
              <span class="flx-slot-meta">{{ slot.items.length ? `${slot.items.length} records` : 'Empty' }}{{ slot.dirty ? ' · modified' : '' }}</span>
            </button>
          </div>
        </aside>
        <main class="flx-fixed-detail">
          <div v-if="selectedMap" class="flx-map-heading">
            <div>
              <h2>Map {{ selectedMap.index }}</h2>
              <span>{{ selectedMap.items.length }} records · {{ selectedMap.dirty ? 'replacement pending' : 'uploaded payload' }}</span>
            </div>
            <span v-if="selectedMap.items.length" class="flx-map-coordinate-note">X/Y world units · Z elevation</span>
          </div>
          <FixedArchiveMapPreview
            class="flx-fixed-preview"
            :items="selectedMap?.items ?? []"
            :reference-data="referenceData"
            :atlas-images="atlasImages"
            :game-id="gameId"
          />
          <div class="flx-record-table-wrap">
            <table class="flx-record-table">
              <thead><tr><th>#</th><th>X</th><th>Y</th><th>Z</th><th>Shape</th><th>Frame</th><th>Flags</th><th>Quality</th><th>NPC</th><th>Map</th><th>Next</th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in selectedMap?.items ?? []" :key="`${selectedMap.index}-${index}`">
                  <td>{{ index }}</td><td>{{ item.x }}</td><td>{{ item.y }}</td><td>{{ item.z }}</td>
                  <td>{{ formatShape(item.shape) }}</td><td>{{ item.frame }}</td><td>{{ formatHex(item.flags) }}</td>
                  <td>{{ formatHex(item.quality) }}</td><td>{{ item.npcNum }}</td><td>{{ item.mapNum }}</td><td>{{ formatHex(item.nextItem) }}</td>
                </tr>
                <tr v-if="selectedMap && !selectedMap.items.length"><td colspan="11" class="flx-no-records">This map slot is empty.</td></tr>
              </tbody>
            </table>
          </div>
        </main>
      </template>
      <div v-else class="flx-empty-state">
        <h2>No FIXED archive loaded</h2>
        <p>Choose a FIXED.DAT file to inspect map slots and records.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import FixedArchiveMapPreview from "./FixedArchiveMapPreview.vue";
import GlobViewer from "./GlobViewer.vue";
import { fetchJson, appUrl } from "../../public/helpers.js";
import { loadImage } from "../../public/scene-api.js";
import { getReferenceAtlasPath, getReferenceDataPath } from "../../shared/runtime-adapter.js";
import { buildGlobViewerEntries, buildMatchingGlobRenderOrders } from "../../lib/glob-viewer-data.js";
import {
  encodeFixedMapRecords,
  encodeGlobEntry,
  parseFixedArchive,
  parseFixedMapRecords,
  parseGlobArchive,
  rebuildFixedArchiveBuffer,
  rebuildFlexArchiveBuffer
} from "../../shared/flx-archive-codec.js";
import { state } from "../controller/state.js";

const SCENE_CHANGED_EVENT = "crusader-map-renderer:scene-changed";
const SITE_CONFIG_CHANGED_EVENT = "crusader-map-renderer:site-config-changed";
const activeMode = ref("glob");
const globFileInput = ref(null);
const fixedFileInput = ref(null);
const mapPayloadInput = ref(null);
const globArchive = ref(null);
const globSlots = ref([]);
const selectedGlobIndex = ref(null);
const fixedArchive = ref(null);
const fixedSlots = ref([]);
const selectedMapIndex = ref(null);
const globUndoStack = ref([]);
const globRedoStack = ref([]);
const fixedUndoStack = ref([]);
const fixedRedoStack = ref([]);
const errorMessage = ref("");
const gameId = ref("");
const referenceData = ref(null);
const atlasImages = ref(new Map());
const referenceError = ref("");
const newChild = reactive({ x: 0, y: 0, z: 0, shape: 0, frame: 0 });
const referenceDataCache = new Map();
const imageCache = new Map();

const selectedGlobSlot = computed(() => globSlots.value.find((slot) => slot.index === selectedGlobIndex.value) ?? null);
const selectedMap = computed(() => fixedSlots.value.find((slot) => slot.index === selectedMapIndex.value) ?? null);
const globDirty = computed(() => globSlots.value.some((slot) => slot.dirty));
const fixedDirty = computed(() => fixedSlots.value.some((slot) => slot.dirty));
const activeDirty = computed(() => activeMode.value === "glob" ? globDirty.value : fixedDirty.value);
const activeLoaded = computed(() => activeMode.value === "glob" ? Boolean(globArchive.value) : Boolean(fixedArchive.value));
const activeArchiveSummary = computed(() => {
  if (activeMode.value === "glob") {
    return globArchive.value ? `${globArchive.value.fileName} · ${globSlots.value.length} slots` : "GLOB archive inspection and editing";
  }
  return fixedArchive.value ? `${fixedArchive.value.fileName} · ${fixedSlots.value.length} map slots` : "FIXED archive inspection and editing";
});
const fixedShapeFamilies = computed(() => new Map((referenceData.value?.shapeDefinitions ?? []).map((definition) => [definition.shape, definition.family])));
const globUsageByIndex = computed(() => {
  if (!fixedArchive.value || !referenceData.value) {
    return null;
  }
  const usage = new Map();
  let complete = true;
  for (const slot of fixedSlots.value) {
    for (const item of slot.items) {
      const family = fixedShapeFamilies.value.get(item.shape);
      if (!Number.isInteger(family)) {
        complete = false;
      } else if (family === 3) {
        const maps = usage.get(item.quality) ?? [];
        maps.push(slot.index);
        usage.set(item.quality, maps);
      }
    }
  }
  return { byIndex: usage, complete };
});
const globViewerSource = computed(() => {
  const usage = globUsageByIndex.value;
  const children = globSlots.value.map((slot) => slot.children);
  const referenceEntries = referenceData.value?.globCatalogs?.find((entry) => entry.gameId === gameId.value)?.entries ?? [];
  const renderOrdersByIndex = buildMatchingGlobRenderOrders(children, referenceEntries);
  const entries = buildGlobViewerEntries(children, usage?.byIndex ?? null, renderOrdersByIndex)
    .map((entry) => ({ ...entry, usageComplete: usage?.complete ?? false }));
  return {
    fileName: globArchive.value?.fileName ?? "GLOB.FLX",
    entries
  };
});

function formatIndex(index) {
  return `0x${Number(index).toString(16).padStart(4, "0")}`;
}

function formatShape(shape) {
  return `0x${Number(shape).toString(16).padStart(4, "0")}`;
}

function formatHex(value) {
  return `0x${Number(value).toString(16).padStart(4, "0")}`;
}

function hasExtension(fileName, extension) {
  return String(fileName ?? "").toLowerCase().endsWith(extension);
}

function confirmDiscard(archiveType, dirty) {
  return !dirty || window.confirm(`Discard unsaved ${archiveType} working-copy changes?`);
}

function buildGlobSlots(archive) {
  return archive.entries.map((entry) => ({
    index: entry.index,
    bytes: entry.bytes.slice(),
    children: entry.children.map((child) => ({ ...child })),
    isNew: false,
    dirty: false
  }));
}

function copyGlobSlots() {
  return globSlots.value.map((slot) => ({
    ...slot,
    bytes: slot.bytes.slice(),
    children: slot.children.map((child) => ({ ...child }))
  }));
}

function copyFixedSlots() {
  return fixedSlots.value.map((slot) => ({
    ...slot,
    bytes: slot.bytes.slice(),
    originalBytes: slot.originalBytes.slice(),
    items: slot.items.map((item) => ({ ...item }))
  }));
}

function pushSnapshot(undoStack, redoStack, snapshot) {
  undoStack.value = [...undoStack.value.slice(-99), snapshot];
  redoStack.value = [];
}

function recordGlobEdit() {
  pushSnapshot(globUndoStack, globRedoStack, copyGlobSlots());
}

function recordFixedEdit() {
  pushSnapshot(fixedUndoStack, fixedRedoStack, copyFixedSlots());
}

function undoGlobEdit() {
  if (!globUndoStack.value.length) {
    return;
  }
  globRedoStack.value = [...globRedoStack.value, copyGlobSlots()];
  globSlots.value = globUndoStack.value.at(-1);
  globUndoStack.value = globUndoStack.value.slice(0, -1);
  if (!globSlots.value.some((slot) => slot.index === selectedGlobIndex.value)) {
    selectedGlobIndex.value = globSlots.value.at(-1)?.index ?? null;
  }
}

function redoGlobEdit() {
  if (!globRedoStack.value.length) {
    return;
  }
  globUndoStack.value = [...globUndoStack.value, copyGlobSlots()];
  globSlots.value = globRedoStack.value.at(-1);
  globRedoStack.value = globRedoStack.value.slice(0, -1);
  if (!globSlots.value.some((slot) => slot.index === selectedGlobIndex.value)) {
    selectedGlobIndex.value = globSlots.value.at(-1)?.index ?? null;
  }
}

function undoFixedEdit() {
  if (!fixedUndoStack.value.length) {
    return;
  }
  fixedRedoStack.value = [...fixedRedoStack.value, copyFixedSlots()];
  fixedSlots.value = fixedUndoStack.value.at(-1);
  fixedUndoStack.value = fixedUndoStack.value.slice(0, -1);
}

function redoFixedEdit() {
  if (!fixedRedoStack.value.length) {
    return;
  }
  fixedUndoStack.value = [...fixedUndoStack.value, copyFixedSlots()];
  fixedSlots.value = fixedRedoStack.value.at(-1);
  fixedRedoStack.value = fixedRedoStack.value.slice(0, -1);
}

async function handleGlobUpload(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  await loadGlobFile(file);
}

async function loadGlobFile(file) {
  try {
    if (!hasExtension(file.name, ".flx")) {
      throw new Error("Choose a .FLX archive for GLOB inspection.");
    }
    const parsed = parseGlobArchive(await file.arrayBuffer());
    if (!confirmDiscard("GLOB", globDirty.value)) {
      return;
    }
    globArchive.value = { fileName: file.name, bytes: parsed.data.slice(), originalSlotCount: parsed.entries.length };
    globSlots.value = buildGlobSlots(parsed);
    globUndoStack.value = [];
    globRedoStack.value = [];
    selectedGlobIndex.value = globSlots.value[0]?.index ?? null;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `GLOB upload rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function handleFixedUpload(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  await loadFixedFile(file);
}

async function loadFixedFile(file) {
  try {
    if (!hasExtension(file.name, ".dat")) {
      throw new Error("Choose a .DAT archive for FIXED inspection.");
    }
    const parsed = parseFixedArchive(await file.arrayBuffer());
    const slots = parsed.entries.map((entry) => ({
      index: entry.index,
      bytes: entry.bytes.slice(),
      originalBytes: entry.bytes.slice(),
      items: parseFixedMapRecords(entry.bytes),
      dirty: false
    }));
    if (!confirmDiscard("FIXED", fixedDirty.value)) {
      return;
    }
    fixedArchive.value = { fileName: file.name, bytes: parsed.data.slice() };
    fixedSlots.value = slots;
    fixedUndoStack.value = [];
    fixedRedoStack.value = [];
    selectedMapIndex.value = slots[0]?.index ?? null;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `FIXED upload rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function handleFileDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }
  if (hasExtension(file.name, ".flx")) {
    activeMode.value = "glob";
    await loadGlobFile(file);
  } else if (hasExtension(file.name, ".dat")) {
    activeMode.value = "fixed";
    await loadFixedFile(file);
  } else {
    errorMessage.value = "Unsupported file. Choose a GLOB .FLX or FIXED .DAT archive.";
  }
}

function clearGlobArchive() {
  if (!confirmDiscard("GLOB", globDirty.value)) {
    return;
  }
  globArchive.value = null;
  globSlots.value = [];
  selectedGlobIndex.value = null;
  globUndoStack.value = [];
  globRedoStack.value = [];
  errorMessage.value = "";
}

function clearFixedArchive() {
  if (!confirmDiscard("FIXED", fixedDirty.value)) {
    return;
  }
  fixedArchive.value = null;
  fixedSlots.value = [];
  selectedMapIndex.value = null;
  fixedUndoStack.value = [];
  fixedRedoStack.value = [];
  errorMessage.value = "";
}

function addGlobSlot() {
  recordGlobEdit();
  const index = globSlots.value.length;
  const slot = { index, bytes: encodeGlobEntry([]), children: [], isNew: true, dirty: true };
  globSlots.value = [...globSlots.value, slot];
  selectedGlobIndex.value = index;
}

function addGlobChild() {
  if (!selectedGlobSlot.value?.isNew) {
    return;
  }
  try {
    const children = [...selectedGlobSlot.value.children, { ...newChild }];
    const bytes = encodeGlobEntry(children);
    recordGlobEdit();
    globSlots.value = globSlots.value.map((slot) => slot.index === selectedGlobIndex.value
      ? { ...slot, children, bytes, dirty: true }
      : slot);
    newChild.x = 0;
    newChild.y = 0;
    newChild.z = 0;
    newChild.shape = 0;
    newChild.frame = 0;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `Descriptor rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function removeGlobSlot() {
  if (selectedGlobIndex.value === null) {
    return;
  }
  const usage = globUsageByIndex.value;
  const mapIds = usage?.byIndex.get(selectedGlobIndex.value) ?? null;
  const references = mapIds?.length ? ` Referenced by uploaded map slots: ${mapIds.join(", ")}.` : "";
  const usageNote = !usage
    ? " Map usage is unknown."
    : `${references}${usage.complete ? "" : " Some references may be unknown because shape metadata is incomplete."}`;
  if (!window.confirm(`Empty GLOB slot ${selectedGlobIndex.value}? Its index will be preserved.${usageNote}`)) {
    return;
  }
  recordGlobEdit();
  globSlots.value = globSlots.value.map((slot) => slot.index === selectedGlobIndex.value
    ? { ...slot, bytes: new Uint8Array(), children: [], dirty: true }
    : slot);
  errorMessage.value = "";
}

function downloadBytes(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getEditedFileName(fileName, extension) {
  const baseName = String(fileName ?? "archive").replace(/\.[^.]+$/u, "");
  return `${baseName}-edited.${extension}`;
}

function downloadGlobArchive() {
  if (!globArchive.value || !globDirty.value) {
    return;
  }
  try {
    const replacements = new Map();
    for (const slot of globSlots.value.slice(0, globArchive.value.originalSlotCount)) {
      if (slot.dirty) {
        replacements.set(slot.index, slot.bytes);
      }
    }
    const additions = globSlots.value.slice(globArchive.value.originalSlotCount).map((slot) => slot.bytes);
    const output = rebuildFlexArchiveBuffer(globArchive.value.bytes, replacements, additions);
    downloadBytes(output, getEditedFileName(globArchive.value.fileName, "FLX"));
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `GLOB rebuild failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function handleMapPayloadImport(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !selectedMap.value) {
    return;
  }
  try {
    let bytes;
    if (hasExtension(file.name, ".json")) {
      const document = JSON.parse(await file.text());
      const mapSource = document?.mapSource ?? document;
      if (mapSource?.formatVersion !== "crusader-fixed-map-v1" || !Array.isArray(mapSource.items)) {
        throw new Error("JSON must contain a supported mapSource.items record array.");
      }
      bytes = encodeFixedMapRecords(mapSource.items);
    } else if (hasExtension(file.name, ".bin")) {
      bytes = new Uint8Array(await file.arrayBuffer());
      parseFixedMapRecords(bytes);
    } else {
      throw new Error("Choose a supported Map JSON or 16-byte-record binary payload.");
    }
    const items = parseFixedMapRecords(bytes);
    recordFixedEdit();
    fixedSlots.value = fixedSlots.value.map((slot) => slot.index === selectedMapIndex.value
      ? { ...slot, bytes: bytes.slice(), items, dirty: true }
      : slot);
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `Map payload rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function restoreFixedMap() {
  if (!selectedMap.value) {
    return;
  }
  recordFixedEdit();
  fixedSlots.value = fixedSlots.value.map((slot) => slot.index === selectedMapIndex.value
    ? { ...slot, bytes: slot.originalBytes.slice(), items: parseFixedMapRecords(slot.originalBytes), dirty: false }
    : slot);
}

function downloadFixedArchive() {
  if (!fixedArchive.value || !fixedDirty.value) {
    return;
  }
  try {
    const replacements = new Map(fixedSlots.value.filter((slot) => slot.dirty).map((slot) => [slot.index, slot.bytes]));
    const output = rebuildFixedArchiveBuffer(fixedArchive.value.bytes, replacements);
    downloadBytes(output, getEditedFileName(fixedArchive.value.fileName, "DAT"));
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `FIXED rebuild failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadReferenceAssets(nextGameId) {
  gameId.value = nextGameId;
  const scene = state.current?.scene ?? null;
  const referenceId = scene?.references?.referenceId ?? nextGameId;
  if (!nextGameId || !state.siteConfig) {
    referenceData.value = state.referenceDataByGame.get(referenceId) ?? scene;
    atlasImages.value = new Map(state.current?.atlasImages ?? []);
    return;
  }
  referenceError.value = "";
  try {
    const cachedPayload = state.referenceDataByGame.get(referenceId);
    if (!cachedPayload && !referenceDataCache.has(referenceId)) {
      referenceDataCache.set(referenceId, fetchJson(appUrl(getReferenceDataPath(state.siteConfig, referenceId))));
    }
    const payload = cachedPayload ?? await referenceDataCache.get(referenceId);
    if (gameId.value !== nextGameId) {
      return;
    }
    referenceData.value = payload;
    const loadedImages = new Map(state.current?.atlasImages ?? []);
    await Promise.all((payload?.atlases ?? []).map(async (atlas) => {
      const cacheKey = `${referenceId}:${atlas.id}`;
      if (!imageCache.has(cacheKey)) {
        imageCache.set(cacheKey, loadImage(appUrl(getReferenceAtlasPath(state.siteConfig, referenceId, atlas))));
      }
      try {
        const image = await imageCache.get(cacheKey);
        if (image) {
          loadedImages.set(atlas.id, image);
        }
      } catch {
        imageCache.delete(cacheKey);
      }
    }));
    if (gameId.value === nextGameId) {
      atlasImages.value = loadedImages;
    }
  } catch (error) {
    referenceDataCache.delete(referenceId);
    referenceError.value = error instanceof Error ? error.message : String(error);
    referenceData.value = state.referenceDataByGame.get(referenceId) ?? state.current?.scene ?? scene;
    atlasImages.value = new Map(state.current?.atlasImages ?? []);
  }
}

function handleSceneChanged() {
  void loadReferenceAssets(state.current?.selected?.game ?? "");
}

function handleSiteConfigChanged() {
  void loadReferenceAssets(state.current?.selected?.game ?? "");
}

onMounted(() => {
  window.addEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.addEventListener(SITE_CONFIG_CHANGED_EVENT, handleSiteConfigChanged);
  void loadReferenceAssets(state.current?.selected?.game ?? "");
});

onUnmounted(() => {
  window.removeEventListener(SCENE_CHANGED_EVENT, handleSceneChanged);
  window.removeEventListener(SITE_CONFIG_CHANGED_EVENT, handleSiteConfigChanged);
});
</script>

<style scoped>
.flx-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ink);
}

.flx-header {
  display: grid;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--panel-border);
}

.flx-heading-row,
.flx-controls,
.flx-archive-actions,
.flx-mode-tabs,
.flx-slot-heading,
.flx-map-heading {
  display: flex;
  align-items: center;
}

.flx-heading-row,
.flx-map-heading {
  justify-content: space-between;
  gap: 16px;
}

.flx-title-group {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.flx-title-group h1,
.flx-map-heading h2 {
  margin: 0;
  font-size: 1rem;
}

.flx-title-group span,
.flx-map-heading span,
.flx-inline-hint,
.flx-slot-meta,
.flx-readonly,
.flx-clean {
  color: var(--muted);
  font-size: 0.8rem;
}

.flx-controls {
  flex-wrap: wrap;
  gap: 8px;
}

.flx-mode-tabs {
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--panel-border);
  border-radius: 5px;
  background: color-mix(in srgb, var(--card) 70%, var(--viewport) 30%);
}

.flx-mode-tabs button {
  min-width: 76px;
  min-height: 34px;
  padding: 5px 10px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 750;
  cursor: pointer;
}

.flx-mode-tabs button.is-active {
  background: var(--accent-strong);
  color: #fff;
}

.flx-action {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--panel-border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 18%, var(--card));
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.flx-action:hover:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 30%, var(--card));
}

.flx-action:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.flx-action-quiet {
  border-color: var(--panel-border);
  background: transparent;
}

.flx-action-danger {
  border-color: rgba(196, 93, 63, 0.42);
  background: rgba(196, 93, 63, 0.12);
}

.flx-action-download {
  background: #176f66;
  border-color: #1d8f7e;
  color: #fff;
}

.flx-readonly,
.flx-dirty,
.flx-clean {
  padding: 4px 7px;
  border: 1px solid var(--panel-border);
  border-radius: 3px;
}

.flx-dirty {
  color: #9a431f;
  background: rgba(236, 149, 85, 0.14);
}

.flx-file-input {
  display: none;
}

.flx-error {
  padding: 8px 10px;
  border-left: 3px solid #c45d3f;
  background: rgba(196, 93, 63, 0.1);
  color: var(--ink);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.flx-drop-target {
  min-height: 34px;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--panel-border));
  border-radius: 4px;
  color: var(--muted);
  font-size: 0.76rem;
  text-align: center;
}

.flx-archive-actions {
  flex-wrap: wrap;
  gap: 8px;
  min-height: 48px;
  padding: 7px 0;
}

.flx-file-name {
  max-width: min(36vw, 480px);
  overflow: hidden;
  color: var(--muted);
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flx-action-spacer {
  flex: 1 1 auto;
}

.flx-new-child-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 8px;
  padding: 6px 0 10px;
  border-bottom: 1px solid var(--panel-border);
}

.flx-new-child-form strong {
  align-self: center;
  margin-right: 4px;
  font-size: 0.8rem;
}

.flx-new-child-form label {
  display: grid;
  gap: 3px;
  color: var(--muted);
  font-size: 0.7rem;
}

.flx-new-child-form input {
  width: 70px;
  min-height: 30px;
  padding: 4px 6px;
  border: 1px solid var(--panel-border);
  border-radius: 3px;
  background: var(--card);
  color: var(--ink);
  font: inherit;
}

.flx-content {
  flex: 1;
  min-height: 0;
  padding-top: 2px;
}

.flx-empty-state {
  display: grid;
  align-content: center;
  justify-items: center;
  height: 100%;
  min-height: 240px;
  padding: 24px;
  border: 1px dashed var(--panel-border);
  color: var(--muted);
  text-align: center;
}

.flx-empty-state h2 {
  margin: 0 0 6px;
  color: var(--ink);
  font-size: 1rem;
}

.flx-empty-state p {
  margin: 0;
  font-size: 0.84rem;
}

.flx-fixed-content {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  border-top: 1px solid var(--panel-border);
}

.flx-slot-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--panel-border);
}

.flx-slot-heading {
  justify-content: space-between;
  min-height: 38px;
  padding: 0 10px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 0.82rem;
}

.flx-slot-heading span {
  color: var(--muted);
  font-size: 0.76rem;
}

.flx-slot-list {
  min-height: 0;
  overflow: auto;
}

.flx-slot-option {
  display: grid;
  gap: 3px;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--panel-border) 65%, transparent);
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.flx-slot-option:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.flx-slot-option.is-selected {
  background: color-mix(in srgb, var(--accent) 17%, transparent);
  box-shadow: inset 3px 0 var(--accent);
}

.flx-slot-index {
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 0.78rem;
  font-weight: 700;
}

.flx-fixed-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  padding: 8px 10px 0;
}

.flx-map-heading {
  flex: 0 0 auto;
}

.flx-map-heading > div {
  display: grid;
  gap: 3px;
}

.flx-map-coordinate-note {
  text-align: right;
}

.flx-fixed-preview {
  flex: 1 1 46%;
  min-height: 170px;
}

.flx-record-table-wrap {
  flex: 1 1 54%;
  min-height: 130px;
  overflow: auto;
  border-top: 1px solid var(--panel-border);
}

.flx-record-table {
  width: 100%;
  border-collapse: collapse;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 0.72rem;
  white-space: nowrap;
}

.flx-record-table th,
.flx-record-table td {
  padding: 5px 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--panel-border) 70%, transparent);
  text-align: right;
}

.flx-record-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--panel);
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 0.68rem;
}

.flx-record-table th:nth-child(5),
.flx-record-table td:nth-child(5) {
  text-align: left;
}

.flx-no-records {
  padding: 16px !important;
  color: var(--muted);
  text-align: center !important;
}

@media (max-width: 760px) {
  .flx-header {
    gap: 9px;
  }

  .flx-controls {
    align-items: stretch;
  }

  .flx-controls > .flx-action {
    flex: 1 1 128px;
  }

  .flx-fixed-content {
    grid-template-columns: minmax(120px, 34%) minmax(0, 1fr);
  }

  .flx-slot-option {
    padding-inline: 7px;
  }

  .flx-fixed-detail {
    padding-inline: 6px;
  }

  .flx-map-coordinate-note {
    display: none;
  }
}
</style>