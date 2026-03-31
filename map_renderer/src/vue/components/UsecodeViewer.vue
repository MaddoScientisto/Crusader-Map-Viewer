<template>
  <div class="usecode-viewer">
    <div class="usecode-left">
      <div v-if="loading" class="muted">Loading usecode...</div>
      <div v-else-if="!sources.length" class="muted">No usecode available for this build.</div>
      <ul v-else class="source-list">
        <li v-for="src in sources" :key="src.id">
          <div class="source-name">{{ src.label }}</div>
          <ul class="file-list">
            <li v-for="file in src.files" :key="file.path">
              <button class="file-button" @click="loadFile(file)">{{ file.rel }}</button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
    <div class="usecode-right">
      <div v-if="fileLoading" class="muted">Loading...</div>
      <pre v-else class="usecode-text">{{ fileContent }}</pre>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, toRefs, watch } from "vue";
import { getUsecodeFilePath, getUsecodeIndexPath } from "../../shared/runtime-adapter.js";
import { state } from "../controller/state.js";

const data = reactive({ sources: [], loading: false, fileContent: "", fileLoading: false });

function getUsecodeList() {
  if (!state.current) return;
  data.loading = true;
  const selected = state.current.selected;
  fetch(getUsecodeIndexPath(state.siteConfig, selected.game))
    .then((r) => r.json())
    .then((json) => {
      data.sources = json.sources || [];
      if (!data.sources.length) {
        data.fileContent = "";
      }
    })
    .catch(() => {
      data.sources = [];
      data.fileContent = "";
    })
    .finally(() => (data.loading = false));
}

function loadFile(file) {
  if (!state.current) return;
  data.fileLoading = true;
  fetch(getUsecodeFilePath(state.siteConfig, state.current.selected.game, file.path))
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.text();
    })
    .then((text) => {
      data.fileContent = text;
    })
    .catch((err) => {
      data.fileContent = `Error loading file: ${err.message}`;
    })
    .finally(() => (data.fileLoading = false));
}

watch(() => state.current?.selected?.game, (nextGame) => {
  if (nextGame) {
    getUsecodeList();
  } else {
    data.sources = [];
    data.fileContent = "";
  }
});

onMounted(() => {
  if (state.current) getUsecodeList();
});

const { sources, loading, fileContent, fileLoading } = toRefs(data);

// template can reference `sources`, `loading`, `fileContent`, `fileLoading` and `loadFile`
</script>

<style scoped>
.usecode-viewer {
  display: flex;
  height: 100%;
  min-height: 0;
  border-radius: 24px;
  overflow: hidden;
  background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.04), transparent 26%), var(--viewport);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), var(--shadow);
}

.usecode-left {
  width: 340px;
  min-width: 260px;
  overflow: auto;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px;
  background: rgba(6, 9, 14, 0.42);
}

.usecode-right {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 14px;
}

.usecode-text {
  margin: 0;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.source-list,
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-list {
  display: grid;
  gap: 12px;
}

.file-list {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}

.source-name {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.file-button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: 10px;
  padding: 6px 8px;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
}

.file-button:hover {
  background: rgba(255, 255, 255, 0.05);
}
</style>
