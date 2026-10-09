import assert from "node:assert/strict";

import {
  encodeGlobEntry,
  parseFixedArchive,
  parseFlexArchive,
  parseGlobEntry,
  rebuildFixedArchiveBuffer,
  rebuildFlexArchiveBuffer
} from "../src/shared/flx-archive-codec.js";
import {
  decodeFixedItemRecord as decodeMapSourceRecord,
  encodeFixedItemRecord as encodeMapSourceRecord,
  encodeMapItems
} from "../src/lib/map-source.js";

function makeArchive(kind, payloads) {
  const countOffset = 0x54;
  const tableOffset = 0x80;
  const tableSize = payloads.length * 8;
  const payloadStart = tableOffset + tableSize;
  const data = new Uint8Array(payloadStart + payloads.reduce((sum, payload) => sum + payload.length, 0));
  const view = new DataView(data.buffer);
  if (kind === "FLEX") {
    view.setUint32(countOffset, payloads.length, true);
  } else {
    view.setUint16(countOffset, payloads.length, true);
  }
  let offset = payloadStart;
  payloads.forEach((payload, index) => {
    view.setUint32(tableOffset + index * 8, payload.length ? offset : 0, true);
    view.setUint32(tableOffset + index * 8 + 4, payload.length, true);
    data.set(payload, offset);
    offset += payload.length;
  });
  return data;
}

const globOne = encodeGlobEntry([{ x: 1, y: 2, z: 3, shape: 0x1234, frame: 5 }]);
const flexBytes = makeArchive("FLEX", [globOne, new Uint8Array(), encodeGlobEntry([])]);
const flex = parseFlexArchive(flexBytes);
assert.equal(flex.entries.length, 3);
assert.equal(parseGlobEntry(flex.entries[0].bytes)[0].shape, 0x1234);
assert.equal(parseGlobEntry(flex.entries[1].bytes).length, 0);

const addedGlob = encodeGlobEntry([{ x: 9, y: 8, z: 7, shape: 0x4321, frame: 6 }]);
const rebuiltFlex = rebuildFlexArchiveBuffer(flexBytes, new Map([[1, new Uint8Array()]]), [addedGlob]);
const reopenedFlex = parseFlexArchive(rebuiltFlex);
assert.equal(reopenedFlex.entries.length, 4);
assert.deepEqual([...reopenedFlex.entries[0].bytes], [...globOne]);
assert.equal(reopenedFlex.entries[1].size, 0);
assert.deepEqual(parseGlobEntry(reopenedFlex.entries[3].bytes), [{ x: 9, y: 8, z: 7, shape: 0x4321, frame: 6 }]);
const emptiedFinalGlob = parseFlexArchive(rebuildFlexArchiveBuffer(flexBytes, new Map([[2, new Uint8Array()]])));
assert.equal(emptiedFinalGlob.entries[2].size, 0);

const fixedOne = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
const fixedTwo = Uint8Array.from({ length: 32 }, (_, index) => 0x80 + index);
const fixedBytes = makeArchive("FIXED", [fixedOne, new Uint8Array(), fixedTwo]);
assert.equal(parseFixedArchive(fixedBytes).entries[2].size, 32);
const replacement = Uint8Array.from({ length: 16 }, (_, index) => 0xf0 + index);
const rebuiltFixed = rebuildFixedArchiveBuffer(fixedBytes, new Map([[1, replacement]]));
const reopenedFixed = parseFixedArchive(rebuiltFixed);
assert.deepEqual([...reopenedFixed.entries[0].bytes], [...fixedOne]);
assert.deepEqual([...reopenedFixed.entries[1].bytes], [...replacement]);
assert.deepEqual([...reopenedFixed.entries[2].bytes], [...fixedTwo]);
const emptiedFinalMap = parseFixedArchive(rebuildFixedArchiveBuffer(fixedBytes, new Map([[2, new Uint8Array()]])));
assert.equal(emptiedFinalMap.entries[2].size, 0);

assert.throws(() => parseFlexArchive(flexBytes.subarray(0, 0x80)), /table is truncated/);
const badOffset = flexBytes.slice();
new DataView(badOffset.buffer).setUint32(0x80, badOffset.length + 1, true);
assert.throws(() => parseFlexArchive(badOffset), /outside the archive/);
assert.throws(() => parseGlobEntry(Uint8Array.of(2, 0, 0, 0, 0, 0, 0)), /is truncated/);
assert.throws(() => parseFixedArchive(makeArchive("FIXED", [Uint8Array.of(1)])), /not a multiple/);

const record = { x: 128, y: 256, z: 3, shape: 0x2345, frame: 6, flags: 7, quality: 8, npcNum: 9, mapNum: 10, nextItem: 11 };
const recordBytes = encodeMapSourceRecord(record);
assert.deepEqual(decodeMapSourceRecord(recordBytes), { ...record, source: "fixed" });
assert.deepEqual([...encodeMapItems([record])], [...recordBytes]);

console.log("FLX archive codec tests passed");