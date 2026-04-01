import assert from "node:assert/strict";

import { formatDiskCoords, formatWorldCoords } from "../src/vue/controller/formatters.js";
import { createScenePresentationController } from "../src/vue/controller/scene-presentation.js";

function createBaseDeps(overrides = {}) {
  return {
    state: {
      current: {
        metadata: { bounds: { screenLeft: 0, screenTop: 0 } },
        hiddenIds: new Set(),
        scene: { items: [] },
        spriteIndex: new Map(),
        atlasImages: new Map()
      },
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      pinnedItemId: null,
      hoverItemId: null,
      eggPlacement: null,
      highlightOverlay: {
        itemId: null,
        geometry: null,
        fallbackItem: null,
        alpha: 0,
        targetAlpha: 0,
        lastTimestamp: 0
      }
    },
    context: {},
    viewport: { clientWidth: 1280, clientHeight: 720 },
    canvas: {},
    overlayTooltip: { hidden: true, offsetWidth: 0, offsetHeight: 0, style: {}, classList: { toggle() {} } },
    inspectShapesCheckbox: { checked: true },
    includeEditorCheckbox: { checked: true },
    showEditorLinkArrowsCheckbox: { checked: true },
    alwaysShowRangesCheckbox: { checked: false },
    includeRoofsCheckbox: { checked: true },
    includeOobCheckbox: { checked: true },
    showBoundingBoxesCheckbox: { checked: true },
    showLinkArrowsCheckbox: { checked: true },
    showEggLabelsCheckbox: { checked: true },
    alwaysShowNpcPreviewsCheckbox: { checked: false },
    alwaysShowItemPreviewsCheckbox: { checked: false },
    monsterSpawnerFilterBlockedCheckbox: { checked: false },
    eggPlacementIdInput: { value: "" },
    eggPlacementWarning: { hidden: true, textContent: "" },
    eggList: { innerHTML: "", querySelectorAll() { return []; }, append() {} },
    eggEmpty: { hidden: true, textContent: "" },
    eggCount: { textContent: "0" },
    monsterSpawnerList: { innerHTML: "", append() {} },
    monsterSpawnerEmpty: { hidden: true, textContent: "" },
    monsterSpawnerCount: { textContent: "0" },
    hiddenList: { innerHTML: "", append() {}, querySelectorAll() { return []; } },
    hiddenEmpty: { hidden: true },
    hiddenCount: { textContent: "0" },
    setHiddenExportState() {},
    setStatus() {},
    showToast() {},
    clearTooltipState() {},
    setTooltipState() {},
    openEggEditModal() {},
    closeEggEditModal() {},
    saveCatalogEntry: async () => {},
    saveTeleportEggId: async () => {},
    saveMonsterSpawnerState: async () => {},
    getMonsterSpawnerItems: () => [],
    getMonsterSpawnerPairCandidates: () => [],
    getMonsterSpawnerSignalKey: () => 0,
    getNpcSpawnerInfoForItem: () => null,
    isMonsterSpawnerAutoEnterEnabled: () => false,
    isMonsterSpawnerItem: () => false,
    renderChestSpawnerMetadataRows: () => "",
    renderMonsterSpawnerActivationRows: () => "",
    renderMonsterSpawnerEditor: () => "",
    renderNpcMetadataRows: () => "",
    renderObjectMetadataRows: () => "",
    getUsecodeViewTarget: () => null,
    buildWarpCommand: () => "",
    canEditCatalog: () => false,
    escapeHtml: (value) => String(value),
    describeEggType: () => "Egg",
    eyeIconSvg: () => "",
    renderPenIconSvg: () => "",
    formatEggId: (value) => String(value),
    formatNumericField: (value) => String(value),
    formatDiskCoords,
    formatWorldCoords,
    duplicateTeleportWarning: () => "",
    normalizeTeleportId: (value) => value,
    DEVICE_PIXEL_RATIO: 1,
    EXPORT_BACKGROUND: "#000000",
    EGG_FILTERS: [],
    getItemById: () => null,
    getShapeDefinition: () => null,
    ...overrides
  };
}

function testControllerRequiresDiskFormatter() {
  assert.throws(
    () => createScenePresentationController(createBaseDeps({ formatDiskCoords: undefined })),
    /formatWorldCoords and formatDiskCoords/u
  );
}

function testBoundingGeometryHandlesMissingWorld() {
  const controller = createScenePresentationController(createBaseDeps({
    getShapeDefinition: () => ({ shape: 0x0011, dimensions: { x: 3, y: 3, z: 0 } })
  }));

  const item = {
    id: "item:test",
    shapeDefId: "shape:17",
    egg: { type: "usecode-trigger" },
    npcNum: 0xe0,
    flags: { flipped: false },
    screen: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 }
  };

  assert.equal(controller.getBoundingGeometry(item), null);
}

function testFormattersHandleMissingWorld() {
  assert.equal(formatWorldCoords({}), "-");
  assert.equal(formatDiskCoords({}), "-");
}

function testPointHitsItemUsesScreenRectBeforeCustomGeometry() {
  const controller = createScenePresentationController(createBaseDeps({
    getShapeDefinition: () => ({ shape: 0x0011, dimensions: { x: 3, y: 3, z: 0 } })
  }));

  const item = {
    id: "item:egg",
    shapeDefId: "shape:17",
    egg: { type: "usecode-trigger" },
    npcNum: 0xe0,
    flags: { flipped: false },
    screen: { left: 10, top: 10, right: 26, bottom: 26, width: 16, height: 16 }
  };

  assert.equal(controller.pointHitsItem({ x: 18, y: 18 }, item), true);
  assert.equal(controller.pointHitsItem({ x: 40, y: 18 }, item), false);
}

function testPointHitsItemPrefersProjectedBoundaryGeometry() {
  const item = {
    id: "item:box",
    shapeDefId: "shape:128",
    spriteId: "sprite:128:0",
    world: { x: 64, y: 64, z: 0 },
    flags: { flipped: false },
    screen: { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40, anchorX: 20, anchorY: 40 }
  };

  const controller = createScenePresentationController(createBaseDeps({
    current: undefined,
    getShapeDefinition: () => ({ shape: 0x0080, dimensions: { x: 1, y: 1, z: 1 } }),
    state: {
      current: {
        metadata: { bounds: { screenLeft: 0, screenTop: 0 } },
        hiddenIds: new Set(),
        scene: { items: [item] },
        spriteIndex: new Map(),
        atlasImages: new Map()
      },
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      pinnedItemId: null,
      hoverItemId: null,
      eggPlacement: null,
      highlightOverlay: {
        itemId: null,
        geometry: null,
        fallbackItem: null,
        alpha: 0,
        targetAlpha: 0,
        lastTimestamp: 0
      }
    }
  }));

  const geometry = controller.getBoundingGeometry(item);
  const interiorPoint = {
    x: geometry.hitPolygon.reduce((sum, point) => sum + point.x, 0) / geometry.hitPolygon.length,
    y: geometry.hitPolygon.reduce((sum, point) => sum + point.y, 0) / geometry.hitPolygon.length
  };

  assert.equal(controller.pointHitsItem(interiorPoint, item), true);
  assert.equal(controller.pointHitsItem({ x: 39, y: 39 }, item), false);
}

testControllerRequiresDiskFormatter();
testBoundingGeometryHandlesMissingWorld();
testFormattersHandleMissingWorld();
testPointHitsItemUsesScreenRectBeforeCustomGeometry();
testPointHitsItemPrefersProjectedBoundaryGeometry();

console.log("scene presentation regression checks passed");