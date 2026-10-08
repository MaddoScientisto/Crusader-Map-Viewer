import assert from "node:assert/strict";

import {
  getGizmoArrowHeadLength,
  getGizmoAxisWorldDelta,
  getSelectionGizmoCenter,
  hitTestGizmoAxis,
  isEditorEditableItem,
  isEditorSelectableItem,
  isItemInEditorLayer,
  mapWorldToScenePoint,
  scenePointToMapWorld,
  snapMapPosition
} from "../src/vue/controller/map-editor-geometry.js";

function testWorldSceneCoordinatesRoundTrip() {
  const bounds = { screenLeft: 128, screenTop: 64 };
  const world = { x: 640, y: 512, z: 16 };
  const scene = mapWorldToScenePoint(world, bounds);
  assert.deepEqual(scenePointToMapWorld(scene, world.z, bounds), world);
}

function testSnapRespectsMapRecordCoordinateLimits() {
  assert.deepEqual(snapMapPosition({ x: 35, y: 49, z: 21 }, true, 16), { x: 32, y: 48, z: 16 });
  assert.deepEqual(snapMapPosition({ x: 35, y: 49, z: 21 }, false, 16), { x: 36, y: 50, z: 21 });
  assert.deepEqual(snapMapPosition({ x: 0x1ffff, y: -3, z: 999 }, false, 32), { x: 0x1fffe, y: 0, z: 0xff });
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

function testGlobTerrainIsNotSelectableInEditMode() {
  const fixedItem = { source: "fixed", mapSourceIndex: 3 };
  const floorItem = { source: "glob", kind: "terrain" };
  const eggItem = { source: "glob", kind: "egg" };

  assert.equal(isEditorEditableItem(fixedItem), true);
  assert.equal(isEditorSelectableItem(fixedItem), true);
  assert.equal(isEditorEditableItem(floorItem), false);
  assert.equal(isEditorSelectableItem(floorItem), false);
  assert.equal(isEditorSelectableItem(eggItem), false);
  assert.equal(isEditorSelectableItem({ source: "fixed" }), false);
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

testWorldSceneCoordinatesRoundTrip();
testSnapRespectsMapRecordCoordinateLimits();
testGizmoAxesHitAndConstrainMovement();
testSelectionGizmoCentersOnSelectedGroup();
testGlobTerrainIsNotSelectableInEditMode();
testEditorLayerMatchesSourceProvenance();
testHoveredGizmoArrowheadGrowsSlightly();
console.log("Map editor geometry tests passed.");