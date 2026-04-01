function createDefaultState() {
  return {
    version: 0,
    visible: false,
    pinned: false,
    hover: false,
    hidden: false,
    item: null,
    itemLabel: "",
    displayName: "",
    displayDescription: "",
    metadataRowsHtml: "",
    notesHtml: "",
    monsterSpawnerEditorHtml: "",
    showCatalogEditor: false,
    showTeleportEggEditor: false,
    showPinnedActions: false,
    usecodeTarget: null,
    warpCommand: "",
    catalogEntry: null,
    eyeIconSvg: "",
    penIconSvg: "",
    onToggleHidden: null,
    onSaveCatalog: null,
    onEditEgg: null,
    onOpenUsecode: null,
    onCopyWarpCommand: null,
    onSaveMonsterSpawner: null
  };
}

let tooltipState = createDefaultState();
let previewRenderer = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener(tooltipState);
  }
}

export function getTooltipState() {
  return tooltipState;
}

export function subscribeTooltipState(listener) {
  listeners.add(listener);
  listener(tooltipState);
  return () => {
    listeners.delete(listener);
  };
}

export function setTooltipState(nextState) {
  tooltipState = {
    ...createDefaultState(),
    ...tooltipState,
    ...nextState,
    version: tooltipState.version + 1
  };
  emit();
}

export function clearTooltipState() {
  tooltipState = {
    ...createDefaultState(),
    version: tooltipState.version + 1
  };
  emit();
}

export function registerTooltipPreviewRenderer(renderer) {
  previewRenderer = renderer;
}

export function renderTooltipPreview(canvasElement, item) {
  if (!canvasElement || !item || typeof previewRenderer !== "function") {
    return;
  }
  previewRenderer(canvasElement, item);
}
