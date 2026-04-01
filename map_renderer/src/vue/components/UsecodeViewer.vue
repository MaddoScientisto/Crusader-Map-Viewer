<template>
  <div class="usecode-viewer">
    <div class="usecode-left">
      <div class="usecode-toolbar">
        <input
          v-model.trim="searchQuery"
          class="usecode-search"
          type="search"
          placeholder="Search scripts by name"
          spellcheck="false"
        >
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
      <div v-if="fileLoading" class="muted">Loading...</div>
      <div v-else-if="!fileContent" class="muted">Choose a script from the tree to view it.</div>
      <pre v-else class="usecode-text">{{ fileContent }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, onUnmounted, reactive, ref, toRefs } from "vue";
import { getUsecodeFilePath, getUsecodeIndexPath } from "../../shared/runtime-adapter.js";
import { state } from "../controller/state.js";

const USECODE_STATE_EVENT = "crusader-map-renderer:scene-changed";
const OPEN_USECODE_TARGET_EVENT = "crusader-map-renderer:open-usecode-target";
const data = reactive({ sources: [], sourceFiles: [], loading: false, fileContent: "", fileLoading: false });
const searchQuery = ref("");
const activeFilePath = ref("");
let pendingOpenTarget = null;

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function countFiles(nodes) {
  return nodes.reduce((total, node) => total + (node.kind === "file" ? 1 : countFiles(node.children)), 0);
}

function normalizeEventNameHint(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSlotValue(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^0x[0-9a-f]+$/i.test(text)) {
    return Number.parseInt(text.slice(2), 16);
  }
  if (/^[0-9]+$/i.test(text)) {
    return Number.parseInt(text, 10);
  }
  return null;
}

function formatTargetSlot(slot) {
  const slotValue = normalizeSlotValue(slot);
  if (slotValue === null) {
    return "unknown slot";
  }
  return `slot 0x${slotValue.toString(16).padStart(2, "0")}`;
}

function describeUsecodeTarget(target) {
  if (!target) {
    return "selected usecode target";
  }
  const eventLabel = target.eventNameHint || formatTargetSlot(target.slot);
  return `${target.className}.${eventLabel}`;
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

function flattenSourceFiles(sources) {
  return sources.flatMap((source) => Array.isArray(source.files) ? source.files : []);
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
  fetch(getUsecodeIndexPath(state.siteConfig, selected.game))
    .then((r) => r.json())
    .then((json) => {
      const sourceEntries = json.sources || [];
      data.sourceFiles = flattenSourceFiles(sourceEntries);
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

function findUsecodeFile(target) {
  if (!target?.className) {
    return null;
  }

  const className = String(target.className).trim().toUpperCase();
  const classFiles = data.sourceFiles.filter((file) => String(file.className ?? "").trim().toUpperCase() === className);
  if (!classFiles.length) {
    return null;
  }

  const slotValue = normalizeSlotValue(target.slot);
  if (slotValue !== null) {
    const slotMatch = classFiles.find((file) => normalizeSlotValue(file.slot) === slotValue);
    if (slotMatch) {
      return slotMatch;
    }
  }

  const eventCandidates = [target.eventNameHint, ...(target.fallbackEventNameHints ?? [])]
    .map((name) => normalizeEventNameHint(name))
    .filter(Boolean);
  for (const eventName of eventCandidates) {
    const eventMatch = classFiles.find((file) => normalizeEventNameHint(file.eventNameHint) === eventName);
    if (eventMatch) {
      return eventMatch;
    }
  }

  return classFiles[0] ?? null;
}

function openUsecodeTarget(target) {
  pendingOpenTarget = target;
  if (data.loading || !state.current?.selected?.game) {
    return;
  }

  const file = findUsecodeFile(target);
  if (!file) {
    activeFilePath.value = "";
    data.fileContent = `No usecode file matched ${describeUsecodeTarget(target)} in this build.`;
    return;
  }

  searchQuery.value = [target.className, target.eventNameHint || formatTargetSlot(target.slot)].filter(Boolean).join(" ");
  pendingOpenTarget = null;
  loadFile(file);
}

function handleOpenUsecodeTarget(event) {
  openUsecodeTarget(event.detail ?? null);
}

function loadFile(file) {
  if (!state.current) return;
  activeFilePath.value = file.path;
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

onMounted(() => {
  window.addEventListener(USECODE_STATE_EVENT, refreshFromControllerState);
  window.addEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
  refreshFromControllerState();
});

onUnmounted(() => {
  window.removeEventListener(USECODE_STATE_EVENT, refreshFromControllerState);
  window.removeEventListener(OPEN_USECODE_TARGET_EVENT, handleOpenUsecodeTarget);
});

const { sources, loading, fileContent, fileLoading } = toRefs(data);
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

.usecode-search {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ink);
  font: inherit;
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
</style>
