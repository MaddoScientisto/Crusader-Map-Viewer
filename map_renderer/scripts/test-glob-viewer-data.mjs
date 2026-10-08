import assert from "node:assert/strict";

import { buildGlobRenderOrders, buildGlobViewerEntries } from "../src/lib/glob-viewer-data.js";

const globs = [
  [
    { x: 12, y: 16, z: 0, shape: 0x023d, frame: 4 },
    { x: 13, y: 16, z: 2, shape: 0x023d, frame: 5 }
  ],
  []
];
const usage = new Map([
  [0, [34, 2, 34]],
  [1, []]
]);

assert.deepEqual(buildGlobViewerEntries(globs, usage), [
  {
    index: 0,
    children: [
      { childIndex: 0, renderOrder: 0, x: 12, y: 16, z: 0, shape: 0x023d, frame: 4, spriteId: "sprite:573:4" },
      { childIndex: 1, renderOrder: 1, x: 13, y: 16, z: 2, shape: 0x023d, frame: 5, spriteId: "sprite:573:5" }
    ],
    maps: [2, 34]
  },
  { index: 1, children: [], maps: [] }
]);

const sortGlobs = [[
  { x: 10, y: 10, z: 1, shape: 2, frame: 0 },
  { x: 10, y: 10, z: 0, shape: 1, frame: 0 }
]];
const frames = new Map([["1:0", { width: 32, height: 32, xoff: 16, yoff: 32 }], ["2:0", { width: 32, height: 32, xoff: 16, yoff: 32 }]]);
const archive = {
  decodeFrame(shape, frame) {
    return { frame: frames.get(`${shape}:${frame}`), pixels: new Uint8Array(1) };
  }
};
const shapeInfos = Array.from({ length: 3 }, () => ({
  x: 1,
  y: 1,
  z: 0,
  isOccl: false,
  isTranslucent: false,
  isSolid: false,
  isDraw: true,
  isRoof: false,
  isNoisy: false,
  animType: 0,
  isFixed: true,
  isInvitem: false,
  isLand: true
}));
const renderOrders = buildGlobRenderOrders(sortGlobs, archive, shapeInfos);
const sortedEntries = buildGlobViewerEntries(sortGlobs, new Map(), renderOrders);
assert.deepEqual(sortedEntries[0].children.map((child) => child.childIndex), [0, 1]);
assert.deepEqual(sortedEntries[0].children.map((child) => child.renderOrder), [1, 0]);

console.log("Glob viewer data tests passed.");