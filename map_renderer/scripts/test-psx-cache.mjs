import assert from "node:assert/strict";

import { collectPsxRecordFamilies } from "../src/lib/psx-cache.js";

function writeU16LE(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
}

function writeU32LE(buffer, offset, value) {
  buffer.writeUInt32LE(value, offset);
}

function createSyntheticPsxWdl() {
  const headerSize = 0x34;
  const section00Size = 4 + 24 + 24;
  const buffer = Buffer.alloc(headerSize + section00Size);

  writeU32LE(buffer, 0x00, headerSize);
  writeU32LE(buffer, 0x04, 0);
  writeU32LE(buffer, 0x08, section00Size);

  const section00Offset = headerSize;
  writeU32LE(buffer, section00Offset, 1);
  const region00Words = [0x0010, 0x0001, 0x0002, 0x0020, 0x0005, 0x0006, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < region00Words.length; index += 1) {
    writeU16LE(buffer, section00Offset + 4 + index * 2, region00Words[index]);
  }

  const region01Offset = section00Offset + 4 + 24;
  const region01Words = [
    0x0007, 0x0011, 0x0022, 0x0002, 0x0003, 0x0022,
    0x0008, 0x0033, 0x0044, 0x0000, 0x0004, 0x0030
  ];
  for (let index = 0; index < region01Words.length; index += 1) {
    writeU16LE(buffer, region01Offset + index * 2, region01Words[index]);
  }

  return buffer;
}

function testCollectPsxRecordFamiliesRetainsRootAndBulkFamilies() {
  const families = collectPsxRecordFamilies(createSyntheticPsxWdl());

  assert.equal(families.length, 2);
  assert.deepEqual(
    families.map((family) => ({
      sourceFamily: family.sourceFamily,
      role: family.role,
      recordCount: family.recordCount
    })),
    [
      { sourceFamily: "section0_dispatch_roots", role: "root-dispatch", recordCount: 1 },
      { sourceFamily: "section0_constructor_placements", role: "constructor-placement", recordCount: 1 }
    ]
  );

  const flattened = families.flatMap((family) => family.records);
  assert.equal(flattened.length, 2);
  assert.deepEqual(
    flattened.map((record) => record.sourceFamily),
    ["section0_dispatch_roots", "section0_constructor_placements"]
  );
}

function testCollectPsxRecordFamiliesReturnsEmptyForInvalidInput() {
  assert.deepEqual(collectPsxRecordFamilies(Buffer.alloc(8)), []);
}

function testStructuredRegion01RecordsKeepDecodedElevation() {
  const families = collectPsxRecordFamilies(createSyntheticPsxWdl());
  const region01 = families.find((family) => family.sourceFamily === "section0_constructor_placements");

  assert.ok(region01);
  assert.deepEqual(
    region01.records.map((record) => record.u3 & 0xff),
    [1]
  );
}

function main() {
  testCollectPsxRecordFamiliesRetainsRootAndBulkFamilies();
  testCollectPsxRecordFamiliesReturnsEmptyForInvalidInput();
  testStructuredRegion01RecordsKeepDecodedElevation();
  console.log("psx cache tests passed");
}

main();