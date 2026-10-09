import assert from "node:assert/strict";
import { packCompactSceneItems, unpackCompactSceneItems } from "../src/shared/compact-scene-codec.js";
import { getGlobOriginDelta, GLOB_COORD_BLOCK_SIZE, quantizeGlobAxisDelta, translateGlobChildPosition } from "../src/shared/glob-coordinate.js";
import { expandGlobItem } from "../src/lib/formats.js";
import { clearMapEditorSelectionState } from "../src/vue/controller/map-editor-selection.js";
import { sortMapEditorSceneItems } from "../src/vue/controller/map-editor-scene.js";

import {
  getGizmoArrowHeadLength,
  getGizmoAxisWorldDelta,
  getFixedMapSourceItem,
  getSelectionGizmoCenter,
  hitTestGizmoAxis,
  isEditorEditableItem,
  isEditorMapSourceSupported,
  isEditorSelectableGlobItem,
  isEditorSelectableItem,
  isItemInEditorLayer,
  mapWorldToScenePoint,
  scenePointToMapWorld,
  snapGlobPlacementPosition,
  snapMapPosition
} from "../src/vue/controller/map-editor-geometry.js";

function testWorldSceneCoordinatesRoundTrip() {
  const bounds = { screenLeft: 128, screenTop: 64 };
  const world = { x: 640, y: 512, z: 16 };
  const scene = mapWorldToScenePoint(world, bounds);
  assert.deepEqual(scenePointToMapWorld(scene, world.z, bounds), world);
}

function testEditorMapSupportDoesNotRequireAdminAccess() {
  assert.equal(isEditorMapSourceSupported({ formatVersion: "crusader-fixed-map-v1" }), true);
  assert.equal(isEditorMapSourceSupported({ formatVersion: "crusader-fixed-map-v1", binaryExportSupported: false }), false);
  assert.equal(isEditorMapSourceSupported({ formatVersion: "other" }), false);
}

function testSnapRespectsMapRecordCoordinateLimits() {
  assert.deepEqual(snapMapPosition({ x: 35, y: 49, z: 21 }, true, 16), { x: 32, y: 48, z: 16 });
  assert.deepEqual(snapMapPosition({ x: 35, y: 49, z: 21 }, false, 16), { x: 36, y: 50, z: 21 });
  assert.deepEqual(snapMapPosition({ x: 0x1ffff, y: -3, z: 999 }, false, 32), { x: 0x1fffe, y: 0, z: 0xff });
}

function testGlobPlacementSnapsToMovementBlocksAtFloor() {
  const position = snapGlobPlacementPosition({ x: 600, y: 1600, z: 42 });
  assert.deepEqual(position, { x: GLOB_COORD_BLOCK_SIZE * 2 - 2, y: GLOB_COORD_BLOCK_SIZE * 3 - 2, z: 0 });
  assert.equal(position.x & (GLOB_COORD_BLOCK_SIZE - 1), GLOB_COORD_BLOCK_SIZE - 2);
  assert.equal(position.y & (GLOB_COORD_BLOCK_SIZE - 1), GLOB_COORD_BLOCK_SIZE - 2);
  assert.deepEqual(snapGlobPlacementPosition({ x: 0x1ffff, y: -1, z: 8 }), { x: 0x1fffe, y: 0x3fe, z: 0 });

  const descriptors = [[{ x: 4, y: 6, z: 1, shape: 0x023d, frame: 4 }]];
  const [placedChild] = expandGlobItem({ ...position, quality: 0 }, descriptors);
  const [originChild] = expandGlobItem({
    x: position.x & ~(GLOB_COORD_BLOCK_SIZE - 1),
    y: position.y & ~(GLOB_COORD_BLOCK_SIZE - 1),
    z: position.z,
    quality: 0
  }, descriptors);
  assert.deepEqual(placedChild, originChild);
}

function testGizmoAxesHitAndConstrainMovement() {
  const center = { x: 100, y: 100 };
  assert.equal(hitTestGizmoAxis({ x: 142, y: 121 }, center), "x");
  assert.equal(hitTestGizmoAxis({ x: 58, y: 121 }, center), "y");
  assert.equal(hitTestGizmoAxis({ x: 100, y: 52 }, center), "z");
  assert.equal(hitTestGizmoAxis({ x: 190, y: 190 }, center), null);
  assert.equal(getGizmoAxisWorldDelta("x", 42, 21), 168);
  assert.equal(getGizmoAxisWorldDelta("y", -42, 21), 168);
  assert.equal(getGizmoAxisWorldDelta("z", 0, -48), 48);
  assert.equal(getGizmoAxisWorldDelta("unknown", 10, 10), 0);
  const globWorldSpan = GLOB_COORD_BLOCK_SIZE * 0.63;
  assert.equal(getGizmoAxisWorldDelta("x", 42, 21, 0.63, globWorldSpan), GLOB_COORD_BLOCK_SIZE);
  assert.equal(getGizmoAxisWorldDelta("y", -42, 21, 0.63, globWorldSpan), GLOB_COORD_BLOCK_SIZE);
  const globParent = { id: "item:2379:fixed:16:0:35838:29694:96", source: "fixed", mapSourceIndex: 453 };
  assert.equal(getFixedMapSourceItem([globParent], 453), globParent);
  assert.equal(getFixedMapSourceItem([globParent], 454), null);
}

function testSelectionGizmoCentersOnSelectedGroup() {
  const items = [
    { id: "fixed:0", screen: { left: 0, right: 20, top: 10, bottom: 30 } },
    { id: "fixed:1", screen: { left: 40, right: 60, top: 30, bottom: 50 } },
    { id: "fixed:2", screen: { left: 100, right: 120, top: 100, bottom: 120 } }
  ];
  assert.deepEqual(getSelectionGizmoCenter(items, new Set(["fixed:0", "fixed:1"]), 2, 5, 7), { x: 65, y: 67 });
  assert.equal(getSelectionGizmoCenter(items, new Set(), 1, 0, 0), null);
}

function testModeTransitionClearsPinnedAndEditorSelections() {
  const state = {
    editor: {
      selectedIds: new Set(["fixed:453"]),
      globSelection: { parentMapSourceIndex: 453, globIndex: 0x0b89 },
      globHover: { parentMapSourceIndex: 453, globIndex: 0x0b89 },
      hoverAxis: "x"
    },
    pinnedItemId: "item:2379:fixed:16:0:35838:29694:96",
    hoverItemId: "item:2379:fixed:16:0:35838:29694:96"
  };
  clearMapEditorSelectionState(state);
  assert.equal(state.editor.selectedIds.size, 0);
  assert.equal(state.editor.globSelection, null);
  assert.equal(state.editor.globHover, null);
  assert.equal(state.editor.hoverAxis, null);
  assert.equal(state.pinnedItemId, null);
  assert.equal(state.hoverItemId, null);
}

function testGlobTerrainIsNotSelectableInEditMode() {
  const fixedItem = { source: "fixed", mapSourceIndex: 3 };
  const floorItem = { source: "glob", kind: "terrain", globParentMapSourceIndex: 3, globIndex: 6, globChildIndex: 0 };
  const eggItem = { source: "glob", kind: "egg" };

  assert.equal(isEditorEditableItem(fixedItem), true);
  assert.equal(isEditorSelectableItem(fixedItem), true);
  assert.equal(isEditorEditableItem(floorItem), false);
  assert.equal(isEditorSelectableItem(floorItem), false);
  assert.equal(isEditorSelectableGlobItem(floorItem), true);
  assert.equal(isEditorSelectableGlobItem({ source: "glob", globIndex: 6 }), false);
  assert.equal(isEditorSelectableItem(eggItem), false);
  assert.equal(isEditorSelectableItem({ source: "fixed" }), false);
}

function testExpandedGlobChildrenKeepParentIdentity() {
  const globs = Array.from({ length: 7 }, () => []);
  globs[6] = [{ x: 1, y: 2, z: 3, shape: 0x023d, frame: 4 }];
  const [child] = expandGlobItem({
    x: 0x1234,
    y: 0x2345,
    z: 10,
    quality: 6,
    sourceRecordIndex: 12
  }, globs);

  assert.equal(child.globParentMapSourceIndex, 12);
  assert.equal(child.globIndex, 6);
  assert.equal(child.globChildIndex, 0);
}

function testGlobMovementUsesRepresentableOriginBlocks() {
  const descriptors = [{ x: 3, y: 4, z: 2, shape: 0x023d, frame: 4 }];
  const beforeParent = { x: 0x03ff, y: 0x07ff, z: 5, quality: 0, sourceRecordIndex: 6 };
  const afterParent = { ...beforeParent, x: beforeParent.x + GLOB_COORD_BLOCK_SIZE, y: beforeParent.y + GLOB_COORD_BLOCK_SIZE, z: 13 };
  const beforeChild = expandGlobItem(beforeParent, [descriptors])[0];
  const afterChild = expandGlobItem(afterParent, [descriptors])[0];
  const delta = getGlobOriginDelta(beforeParent, afterParent);

  assert.deepEqual(delta, { x: GLOB_COORD_BLOCK_SIZE, y: GLOB_COORD_BLOCK_SIZE, z: 8 });
  assert.equal(afterChild.x - beforeChild.x, delta.x);
  assert.equal(afterChild.y - beforeChild.y, delta.y);
  assert.equal(afterChild.z - beforeChild.z, delta.z);
  assert.deepEqual(translateGlobChildPosition(beforeChild, delta), {
    x: afterChild.x,
    y: afterChild.y,
    z: afterChild.z
  });
  assert.deepEqual(descriptors, [{ x: 3, y: 4, z: 2, shape: 0x023d, frame: 4 }]);
  assert.equal(quantizeGlobAxisDelta("x", 511), 0);
  assert.equal(quantizeGlobAxisDelta("x", 512), GLOB_COORD_BLOCK_SIZE);
  assert.equal(quantizeGlobAxisDelta("y", -512), -GLOB_COORD_BLOCK_SIZE);
  assert.equal(quantizeGlobAxisDelta("z", 2.6), 3);
}

function testMapEditorSceneSortingUsesPainterDependenciesAndBounds() {
  const shapeDefinitions = new Map([1, 2].map((shape) => [`shape:${shape}`, {
    id: `shape:${shape}`,
    shape,
    dimensions: { x: 1, y: 1, z: 1 },
    traits: {}
  }]));
  const spriteIndex = new Map([1, 2].map((shape) => [`sprite:${shape}:0`, {
    id: `sprite:${shape}:0`,
    shape,
    frame: 0,
    width: 32,
    height: 32,
    xoff: 16,
    yoff: 32
  }]));
  const upper = {
    id: "upper",
    source: "glob",
    shapeDefId: "shape:1",
    spriteId: "sprite:1:0",
    frame: 0,
    world: { x: 100, y: 100, z: 8 },
    flags: { raw: 0 }
  };
  const lower = {
    id: "lower",
    source: "glob",
    shapeDefId: "shape:2",
    spriteId: "sprite:2:0",
    frame: 0,
    world: { x: 100, y: 100, z: 0 },
    flags: { raw: 0 }
  };

  const sorted = sortMapEditorSceneItems([upper, lower], shapeDefinitions, spriteIndex);

  assert.deepEqual(sorted.prepared.map((node) => node.item.sceneItem.id), ["lower", "upper"]);
  assert.deepEqual(sorted.bounds, {
    screenLeft: -16,
    screenTop: -15,
    screenRight: 16,
    screenBottom: 25,
    width: 32,
    height: 40
  });
}

function testEditorLayerMatchesSourceProvenance() {
  const fixedItem = { source: "fixed" };
  const globItem = { source: "glob" };

  assert.equal(isItemInEditorLayer(fixedItem, "fixed"), true);
  assert.equal(isItemInEditorLayer(fixedItem, "glob"), false);
  assert.equal(isItemInEditorLayer(globItem, "glob"), true);
  assert.equal(isItemInEditorLayer(globItem, "fixed"), false);
  assert.equal(isItemInEditorLayer(globItem, "unknown"), false);
}

function testHoveredGizmoArrowheadGrowsSlightly() {
  assert.equal(getGizmoArrowHeadLength("x", null), 8);
  assert.equal(getGizmoArrowHeadLength("x", "x"), 10);
  assert.equal(getGizmoArrowHeadLength("x", "y"), 8);
}

function testCompactScenePreservesGlobProvenance() {
  const packed = packCompactSceneItems([{
    source: "glob",
    x: 40,
    y: 64,
    z: 8,
    shape: 0x023d,
    frame: 4,
    flags: 0,
    quality: 0,
    npcNum: 0,
    mapNum: 0,
    nextItem: 0,
    mapSourceIndex: null,
    globParentMapSourceIndex: 12,
    globIndex: 6,
    globChildIndex: 2
  }]);
  const [decoded] = unpackCompactSceneItems(packed);
  assert.equal(decoded.globParentMapSourceIndex, 12);
  assert.equal(decoded.globIndex, 6);
  assert.equal(decoded.globChildIndex, 2);

  const legacyBytes = Buffer.from(packed.data, "base64").subarray(0, 19);
  const [legacyDecoded] = unpackCompactSceneItems({
    format: "crusader-scene-items-b1",
    recordSize: 19,
    itemCount: 1,
    sources: ["glob"],
    data: legacyBytes.toString("base64")
  });
  assert.equal(legacyDecoded.globParentMapSourceIndex, null);
  assert.equal(legacyDecoded.globIndex, null);
  assert.equal(legacyDecoded.globChildIndex, null);
}

testWorldSceneCoordinatesRoundTrip();
testEditorMapSupportDoesNotRequireAdminAccess();
testSnapRespectsMapRecordCoordinateLimits();
testGlobPlacementSnapsToMovementBlocksAtFloor();
testGizmoAxesHitAndConstrainMovement();
testSelectionGizmoCentersOnSelectedGroup();
testModeTransitionClearsPinnedAndEditorSelections();
testGlobTerrainIsNotSelectableInEditMode();
testExpandedGlobChildrenKeepParentIdentity();
testGlobMovementUsesRepresentableOriginBlocks();
testMapEditorSceneSortingUsesPainterDependenciesAndBounds();
testEditorLayerMatchesSourceProvenance();
testHoveredGizmoArrowheadGrowsSlightly();
testCompactScenePreservesGlobProvenance();
console.log("Map editor geometry tests passed.");