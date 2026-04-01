import assert from "node:assert/strict";

import { formatDiskCoords, formatWorldCoords } from "../src/vue/controller/formatters.js";
import { createSceneMetadataHelpers } from "../src/vue/controller/scene-metadata.js";
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

function testAutoEnabledSpawnerPreviewUsesSingleFrameOneCarrier() {
  const frame0 = {
    id: "item:f0",
    shapeDefId: "shape:1232",
    world: { x: 100, y: 100, z: 0 },
    frame: 0,
    npcPreview: { spriteId: "sprite:1:0" },
    screen: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, anchorX: 0, anchorY: 0 }
  };
  const frame1 = {
    id: "item:f1",
    shapeDefId: "shape:1232",
    world: { x: 102, y: 102, z: 0 },
    frame: 1,
    npcPreview: { spriteId: "sprite:2:0" },
    screen: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, anchorX: 0, anchorY: 0 }
  };

  const controller = createScenePresentationController(createBaseDeps({
    alwaysShowNpcPreviewsCheckbox: { checked: true },
    state: {
      current: {
        metadata: { bounds: { screenLeft: 0, screenTop: 0 } },
        hiddenIds: new Set(),
        scene: { items: [frame0, frame1] },
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
    getShapeDefinition: () => ({ shape: 0x04d0 }),
    isMonsterSpawnerItem: () => true,
    isMonsterSpawnerAutoEnterEnabled: (item) => item.id === frame0.id,
    getMonsterSpawnerPairCandidates: (item) => item.id === frame0.id ? [frame1] : [frame0],
    getMonsterSpawnerLikelySpawnOwner: () => ({ item: frame1, ambiguous: false, pairCount: 1, basis: "paired-frame1-auto" })
  }));

  assert.deepEqual(controller.getVisibleNpcPreviewItems().map((item) => item.id), ["item:f1"]);
}

function testBlockedSpawnerPreviewUsesSingleFrameZeroCarrier() {
  const frame0 = {
    id: "item:bf0",
    shapeDefId: "shape:1232",
    world: { x: 200, y: 200, z: 0 },
    frame: 0,
    npcPreview: { spriteId: "sprite:1:0" },
    screen: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, anchorX: 0, anchorY: 0 }
  };
  const frame1 = {
    id: "item:bf1",
    shapeDefId: "shape:1232",
    world: { x: 202, y: 202, z: 0 },
    frame: 1,
    npcPreview: { spriteId: "sprite:2:0" },
    screen: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, anchorX: 0, anchorY: 0 }
  };

  const controller = createScenePresentationController(createBaseDeps({
    alwaysShowNpcPreviewsCheckbox: { checked: true },
    state: {
      current: {
        metadata: { bounds: { screenLeft: 0, screenTop: 0 } },
        hiddenIds: new Set(),
        scene: { items: [frame0, frame1] },
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
    getShapeDefinition: () => ({ shape: 0x04d0 }),
    isMonsterSpawnerItem: () => true,
    isMonsterSpawnerAutoEnterEnabled: () => false,
    getMonsterSpawnerPairCandidates: (item) => item.id === frame0.id ? [frame1] : [frame0],
    getMonsterSpawnerLikelySpawnOwner: (item) => ({ item: item.id === frame0.id ? frame0 : frame0, ambiguous: false, pairCount: 1, basis: "self-frame0" })
  }));

  assert.deepEqual(controller.getVisibleNpcPreviewItems().map((item) => item.id), ["item:bf0"]);
}

function testFrameOneSpawnerKeepsItsOwnResolvedPreview() {
  const frame0 = {
    id: "item:susan-f0",
    shapeDefId: "shape:1232",
    world: { x: 57142, y: 62018, z: 0 },
    mapNum: 0,
    npcNum: 6,
    quality: 799,
    frame: 0,
    egg: null
  };
  const frame1 = {
    id: "item:susan-f1",
    shapeDefId: "shape:1232",
    world: { x: 57136, y: 62016, z: 0 },
    mapNum: 11,
    npcNum: 11,
    quality: 799,
    frame: 1,
    egg: null
  };

  const metadata = createSceneMetadataHelpers({
    state: {
      current: {
        selected: { game: "remorse" },
        scene: { items: [frame0, frame1] }
      }
    },
    escapeHtml: (value) => String(value),
    getNpcSpawnerInfo: (_game, index) => {
      if (index === 6) {
        return { name: "Observer", shapeHex: "0x033c" };
      }
      if (index === 11) {
        return { name: "RoamingSusan", shapeHex: "0x02cb" };
      }
      return null;
    },
    getShapeDefinition: () => ({ shape: 0x04d0 }),
    getLinkedPreviewDisplay: () => null,
    formatNumericField: (value) => String(value),
    formatWorldCoords: (value) => JSON.stringify(value)
  });

  assert.equal(metadata.getMonsterSpawnerLikelySpawnOwner(frame1).item?.id, frame1.id);
  assert.equal(metadata.getMonsterSpawnerLikelySpawnOwner(frame0).item?.id, frame1.id);
}

function testBlockedFrameOnePreviewStaysFrameOneCarrier() {
  const frame0 = {
    id: "item:chem-f0",
    shapeDefId: "shape:1232",
    world: { x: 61464, y: 59776, z: 0 },
    mapNum: 8,
    npcNum: 99,
    quality: 256,
    frame: 0,
    egg: null
  };
  const frame1 = {
    id: "item:chem-f1",
    shapeDefId: "shape:1232",
    world: { x: 61476, y: 59780, z: 0 },
    mapNum: 7,
    npcNum: 2,
    quality: 256,
    frame: 1,
    egg: null
  };

  const metadata = createSceneMetadataHelpers({
    state: {
      current: {
        selected: { game: "remorse" },
        scene: { items: [frame0, frame1] }
      }
    },
    escapeHtml: (value) => String(value),
    getNpcSpawnerInfo: (_game, index) => index === 2 ? { name: "ChemSuitGuy", shapeHex: "0x02f6" } : null,
    getShapeDefinition: () => ({ shape: 0x04d0 }),
    getLinkedPreviewDisplay: () => null,
    formatNumericField: (value) => String(value),
    formatWorldCoords: (value) => JSON.stringify(value)
  });

  assert.equal(metadata.getMonsterSpawnerLikelySpawnOwner(frame0).item?.id, frame1.id);
  assert.equal(metadata.getMonsterSpawnerLikelySpawnOwner(frame1).item?.id, frame1.id);
}

testControllerRequiresDiskFormatter();
testBoundingGeometryHandlesMissingWorld();
testFormattersHandleMissingWorld();
testPointHitsItemUsesScreenRectBeforeCustomGeometry();
testPointHitsItemPrefersProjectedBoundaryGeometry();
testAutoEnabledSpawnerPreviewUsesSingleFrameOneCarrier();
testBlockedSpawnerPreviewUsesSingleFrameZeroCarrier();
testFrameOneSpawnerKeepsItsOwnResolvedPreview();
testBlockedFrameOnePreviewStaysFrameOneCarrier();

console.log("scene presentation regression checks passed");