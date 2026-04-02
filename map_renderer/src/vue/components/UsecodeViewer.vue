<template>
  <div class="usecode-viewer">
    <div class="usecode-left">
      <div class="usecode-toolbar">
        <div class="usecode-search-wrap">
          <input
            v-model.trim="searchQuery"
            class="usecode-search"
            type="search"
            placeholder="Search scripts by name"
            spellcheck="false"
          >
          <button
            v-if="searchQuery"
            class="usecode-search-clear"
            type="button"
            aria-label="Clear usecode search"
            title="Clear search"
            @click="searchQuery = ''"
          >
            ×
          </button>
        </div>
      </div>
      <div v-if="loading" class="muted">Loading usecode...</div>
      <div v-else-if="!sources.length" class="muted">No usecode available for this build.</div>
      <div v-else-if="!filteredSources.length" class="muted">No scripts match that search.</div>
      <ul v-else class="source-list">
        <li v-for="src in filteredSources" :key="src.id" class="source-group">
          <div class="source-header">
            <div class="source-name">{{ src.label }}</div>
            <div class="source-count">{{ src.fileCount }}</div>
          </div>
          <UsecodeTree
            :nodes="src.children"
            :active-path="activeFilePath"
            :load-file="loadFile"
            :search-active="Boolean(searchQuery)"
          />
        </li>
      </ul>
    </div>
    <div class="usecode-right">
      <div class="usecode-code-toolbar" role="toolbar" aria-label="Usecode viewer controls">
        <div class="usecode-code-toolbar-group">
          <button
            class="usecode-code-button"
            type="button"
            title="Decrease code text size"
            aria-label="Decrease code text size"
            :disabled="codeFontSize <= MIN_CODE_FONT_SIZE"
            @click="adjustCodeFontSize(-1)"
          >
            A-
          </button>
          <button
            class="usecode-code-button"
            type="button"
            title="Increase code text size"
            aria-label="Increase code text size"
            :disabled="codeFontSize >= MAX_CODE_FONT_SIZE"
            @click="adjustCodeFontSize(1)"
          >
            A+
          </button>
        </div>
        <button
          :class="['usecode-code-button', { 'is-active': softWrapEnabled }]"
          type="button"
          :aria-pressed="softWrapEnabled"
          :title="softWrapEnabled ? 'Disable soft wrapping' : 'Enable soft wrapping'"
          @click="softWrapEnabled = !softWrapEnabled"
        >
          Wrap
        </button>
      </div>
      <div v-if="fileLoading" class="muted">Loading...</div>
      <div v-else-if="!fileContent" class="muted">Choose a script from the tree to view it.</div>
      <pre
        v-else
        :class="['usecode-text', { 'is-soft-wrapped': softWrapEnabled }]"
        :style="codeTextStyle"
        v-html="highlightedFileContent"
      ></pre>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref, toRefs, watch } from "vue";
import {
  describeUsecodeTarget,
  formatTargetSlot,
  highlightUsecodeText,
  loadUsecodeIndex,
  loadUsecodeText,
  resolveUsecodeTargetFile
} from "../../shared/usecode-browser.js";
import { state } from "../controller/state.js";

const USECODE_STATE_EVENT = "crusader-map-renderer:scene-changed";
const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const USECODE_VIEWER_PREFERENCES_KEY = "crusader-map-renderer:usecode-viewer-preferences";
const MIN_CODE_FONT_SIZE = 10;
const MAX_CODE_FONT_SIZE = 24;
const DEFAULT_CODE_FONT_SIZE = 12;
const data = reactive({ sources: [], sourceFiles: [], loading: false, fileContent: "", fileLoading: false });
const searchQuery = ref("");
const activeFilePath = ref("");
const codeFontSize = ref(DEFAULT_CODE_FONT_SIZE);
const softWrapEnabled = ref(false);
let pendingOpenTarget = null;

function clampCodeFontSize(value) {
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, value));
}

function readUsecodeViewerPreferences() {
  try {
    const raw = window.localStorage?.getItem(USECODE_VIEWER_PREFERENCES_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeUsecodeViewerPreferences() {
  try {
    window.localStorage?.setItem(
      USECODE_VIEWER_PREFERENCES_KEY,
      JSON.stringify({
        codeFontSize: codeFontSize.value,
        softWrapEnabled: softWrapEnabled.value
      })
    );
  } catch {
    // Ignore storage failures so the viewer still works in restricted environments.
  }
}

function restoreUsecodeViewerPreferences() {
  const preferences = readUsecodeViewerPreferences();
  if (!preferences || typeof preferences !== "object") {
    return;
  }
  if (Number.isFinite(preferences.codeFontSize)) {
    codeFontSize.value = clampCodeFontSize(Math.round(preferences.codeFontSize));
  }
  if (typeof preferences.softWrapEnabled === "boolean") {
    softWrapEnabled.value = preferences.softWrapEnabled;
  }
}

function adjustCodeFontSize(delta) {
  codeFontSize.value = clampCodeFontSize(codeFontSize.value + delta);
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function countFiles(nodes) {
  return nodes.reduce((total, node) => total + (node.kind === "file" ? 1 : countFiles(node.children)), 0);
}

function createFolderNode(name, path, depth) {
  return {
    kind: "folder",
    key: `folder:${path}`,
    name,
    path,
    depth,
    children: [],
    fileCount: 0
  };
}

function buildTreeNodes(files) {
  const root = [];
  const folderIndex = new Map();

  for (const file of files) {
    const segments = String(file.rel || file.name || "").split("/").filter(Boolean);
    let currentChildren = root;
    let currentPath = "";

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folderNode = folderIndex.get(currentPath);
      if (!folderNode) {
        folderNode = createFolderNode(segment, currentPath, index);
        folderIndex.set(currentPath, folderNode);
        currentChildren.push(folderNode);
      }
      currentChildren = folderNode.children;
    }

    const fileName = segments.at(-1) ?? file.name;
    currentChildren.push({
      kind: "file",
      key: `file:${file.path}`,
      name: fileName,
      matchText: `${fileName} ${file.rel ?? ""} ${file.eventNameHint ?? ""}`.toLowerCase(),
      file
    });
  }

  function finalize(nodes) {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    for (const node of nodes) {
      if (node.kind === "folder") {
        finalize(node.children);
        node.fileCount = countFiles(node.children);
      }
    }
    return nodes;
  }

  return finalize(root);
}

function buildSourceTree(sources) {
  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    children: buildTreeNodes(source.files ?? []),
    fileCount: (source.files ?? []).length
  }));
}

function filterNodes(nodes, searchValue) {
  if (!searchValue) {
    return nodes;
  }

  const filtered = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.matchText.includes(searchValue)) {
        filtered.push(node);
      }
      continue;
    }

    const nextChildren = filterNodes(node.children, searchValue);
    if (nextChildren.length || node.name.toLowerCase().includes(searchValue)) {
      filtered.push({
        ...node,
        children: nextChildren,
        fileCount: countFiles(nextChildren)
      });
    }
  }
  return filtered;
}

const filteredSources = computed(() => {
  const searchValue = normalizeSearchValue(searchQuery.value);
  return data.sources
    .map((source) => {
      const children = filterNodes(source.children, searchValue);
      return {
        ...source,
        children,
        fileCount: countFiles(children)
      };
    })
    .filter((source) => source.children.length > 0);
});

const UsecodeTree = defineComponent({
  name: "UsecodeTree",
  props: {
    nodes: {
      type: Array,
      required: true
    },
    activePath: {
      type: String,
      default: ""
    },
    loadFile: {
      type: Function,
      required: true
    },
    searchActive: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    function renderNode(node) {
      if (node.kind === "file") {
        return h("li", { key: node.key, class: "tree-item tree-item-file" }, [
          h(
            "button",
            {
              class: ["file-button", "tree-file-button", props.activePath === node.file.path ? "is-active" : null],
              onClick: () => props.loadFile(node.file)
            },
            [
              h("span", { class: "tree-file-name" }, node.name),
              node.file.eventNameHint ? h("span", { class: "tree-file-meta" }, node.file.eventNameHint) : null
            ]
          )
        ]);
      }

      return h("li", { key: node.key, class: "tree-item tree-item-folder" }, [
        h(
          "details",
          {
            class: "tree-folder",
            open: props.searchActive || node.depth < 1
          },
          [
            h("summary", { class: "tree-folder-summary" }, [
              h("span", { class: "tree-folder-name" }, node.name),
              h("span", { class: "tree-folder-count" }, String(node.fileCount))
            ]),
            h(UsecodeTree, {
              nodes: node.children,
              activePath: props.activePath,
              loadFile: props.loadFile,
              searchActive: props.searchActive
            })
          ]
        )
      ]);
    }

    return () => h("ul", { class: "tree-list" }, props.nodes.map((node) => renderNode(node)));
  }
});

function getUsecodeList() {
  if (!state.current) return;
  data.loading = true;
  const selected = state.current.selected;
  loadUsecodeIndex(state.siteConfig, selected.game)
    .then(({ sources: sourceEntries, sourceFiles }) => {
      data.sourceFiles = sourceFiles;
      data.sources = buildSourceTree(sourceEntries);
      if (activeFilePath.value) {
        const hasActiveFile = sourceEntries.some((source) => (source.files || []).some((file) => file.path === activeFilePath.value));
        if (!hasActiveFile) {
          activeFilePath.value = "";
          data.fileContent = "";
        }
      }
      if (!data.sources.length) {
        data.fileContent = "";
      }
      if (pendingOpenTarget) {
        openUsecodeTarget(pendingOpenTarget);
      }
    })
    .catch(() => {
      data.sources = [];
      data.sourceFiles = [];
      activeFilePath.value = "";
      data.fileContent = "";
    })
    .finally(() => (data.loading = false));
}

function refreshFromControllerState() {
  if (state.current?.selected?.game) {
    getUsecodeList();
    return;
  }
  data.sources = [];
  data.sourceFiles = [];
  data.fileContent = "";
}

function openUsecodeTarget(target) {
  pendingOpenTarget = target;
  if (data.loading || !state.current?.selected?.game) {
    return;
  }

  resolveUsecodeTargetFile(state.siteConfig, state.current.selected.game, target)
    .then((file) => {
      if (!file) {
        activeFilePath.value = "";
        data.fileContent = `No usecode file matched ${describeUsecodeTarget(target)} in this build.`;
        return;
      }
      searchQuery.value = [target.className, target.eventNameHint || formatTargetSlot(target.slot)].filter(Boolean).join(" ");
      pendingOpenTarget = null;
      loadFile(file);
    })
    .catch((error) => {
      activeFilePath.value = "";
      data.fileContent = `Error resolving ${describeUsecodeTarget(target)}: ${error.message}`;
    });
}

function handleOpenUsecodeTarget(event) {
  openUsecodeTarget(event.detail ?? null);
}

function loadFile(file) {
  if (!state.current) return;
  activeFilePath.value = file.path;
  data.fileLoading = true;
  loadUsecodeText(state.siteConfig, state.current.selected.game, file.path)
    .then((text) => {
      data.fileContent = text;
    })
    .catch((err) => {
      data.fileContent = `Error loading file: ${err.message}`;
    })
    .finally(() => (data.fileLoading = false));
}

onMounted(() => {
  window.addEventListener(USECODE_STATE_EVENT, refreshFromControllerState);
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  restoreUsecodeViewerPreferences();
  refreshFromControllerState();
});

onUnmounted(() => {
  window.removeEventListener(USECODE_STATE_EVENT, refreshFromControllerState);
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
});

const { sources, loading, fileContent, fileLoading } = toRefs(data);
const highlightedFileContent = computed(() => highlightUsecodeText(fileContent.value));
const codeTextStyle = computed(() => ({ fontSize: `${codeFontSize.value}px` }));

watch([codeFontSize, softWrapEnabled], writeUsecodeViewerPreferences);
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
  padding: 0 14px 14px;
  background: rgba(6, 9, 14, 0.42);
}

.usecode-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 -14px 12px;
  padding: 14px;
  background: linear-gradient(180deg, rgba(6, 9, 14, 0.98) 0%, rgba(6, 9, 14, 0.92) 72%, rgba(6, 9, 14, 0) 100%);
  backdrop-filter: blur(10px);
}

.usecode-search-wrap {
  position: relative;
}

.usecode-search {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px 40px 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ink);
  font: inherit;
}

.usecode-search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.usecode-search-clear:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.96);
}

.usecode-right {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 14px;
}

.usecode-code-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -14px -14px 12px;
  padding: 14px;
  background: linear-gradient(180deg, rgba(6, 9, 14, 0.98) 0%, rgba(6, 9, 14, 0.92) 72%, rgba(6, 9, 14, 0) 100%);
  backdrop-filter: blur(10px);
}

.usecode-code-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.usecode-code-button {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  min-width: 48px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ink);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.usecode-code-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.usecode-code-button.is-active {
  background: rgba(13, 108, 125, 0.22);
  border-color: rgba(124, 182, 214, 0.32);
}

.usecode-code-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.usecode-text {
  margin: 0;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  line-height: 1.5;
}

.usecode-text.is-soft-wrapped {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.usecode-text :deep(.usecode-token-comment) {
  color: #7d8f99;
}

.usecode-text :deep(.usecode-token-keyword) {
  color: #ffd166;
}

.usecode-text :deep(.usecode-token-namespace) {
  color: #6fd1ff;
}

.usecode-text :deep(.usecode-token-member) {
  color: #b8d4e3;
}

.usecode-text :deep(.usecode-token-call) {
  color: #b8f18f;
}

.usecode-text :deep(.usecode-token-variable) {
  color: #f7a072;
}

.usecode-text :deep(.usecode-token-number) {
  color: #f28482;
}

.usecode-text :deep(.usecode-token-string) {
  color: #cdb4db;
}

.source-list,
.tree-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-list {
  display: grid;
  gap: 12px;
}

.source-group {
  display: grid;
  gap: 8px;
}

.source-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.source-count,
.tree-folder-count {
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.source-name {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.tree-list {
  display: grid;
  gap: 4px;
}

.tree-list .tree-list {
  margin-left: 14px;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.tree-folder {
  display: grid;
  gap: 4px;
}

.tree-folder-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 8px;
  color: var(--ink);
  font-size: 0.86rem;
  list-style: none;
}

.tree-folder-summary::-webkit-details-marker {
  display: none;
}

.tree-folder-summary::before {
  content: ">";
  margin-right: 8px;
  color: var(--muted);
  transform: rotate(0deg);
  transition: transform 140ms ease;
}

.tree-folder[open] > .tree-folder-summary::before {
  transform: rotate(90deg);
}

.tree-folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.tree-file-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tree-file-button.is-active {
  background: rgba(13, 108, 125, 0.2);
  box-shadow: inset 0 0 0 1px rgba(124, 182, 214, 0.26);
}

.tree-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-file-meta {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

@media (max-width: 900px) {
  .usecode-code-toolbar {
    flex-wrap: wrap;
  }
}
</style>
