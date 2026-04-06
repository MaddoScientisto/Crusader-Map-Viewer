import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CATALOG_ROOT, PSX_CACHE_ROOT, REFERENCE_DATA_CACHE_ROOT, SCENE_CACHE_ROOT } from "../config.js";
import { packSprites } from "./atlas-packer.js";
import { encodePng } from "./png.js";
import { buildSceneReferencePayload } from "./scene-reference-data.js";

const PSX_GAME_ID = "psx-remorse";
const PSX_LABEL = "No Remorse PSX";
const PSX_REFERENCE_ID = "psx-remorse";
const PSX_SCENE_VERSION = "psx-runtime-record-probe-v5";
const PSX_REFERENCE_VERSION = "psx-runtime-record-reference-v1";
const PSX_SCREEN_SCALE = 2;
const ALLOWED_U5 = new Set([0x20, 0x22, 0x30]);
const PSX_PROCESSED_CATALOG_FILE = path.join(PSX_CACHE_ROOT, "catalog.json");
const PSX_REFERENCE_CACHE_ROOT = path.join(REFERENCE_DATA_CACHE_ROOT, PSX_REFERENCE_ID);
const PSX_REFERENCE_DATA_FILE = path.join(PSX_REFERENCE_CACHE_ROOT, "reference-data.json");
const PSX_CATALOG_FILE = path.join(CATALOG_ROOT, "psx_shape_catalog_remorse.csv");
const PSX_FAMILY_SECTION0_ROOT = "section0_dispatch_roots";
const PSX_FAMILY_SECTION0_BULK = "section0_constructor_placements";
const PSX_DECOMPRESSED_LEVEL_SIZE = 0x3e00;
const PSX_LEVEL_RING_SIZE = 0x80;
const VERIFIED_TYPE_STATE_FRAME_FALLBACKS = new Map([
  [0x50, { 0: 0, 1: 1, 2: 2, 3: 3 }]
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function fileStamp(filePath) {
  const stat = fs.statSync(filePath);
  return `${path.basename(filePath)}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
}

function readU32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readU16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function toShapeCodeHex(shapeCode) {
  return `0x${shapeCode.toString(16).padStart(4, "0")}`;
}

function toHex32(value) {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function getMapIdFromRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/gu, "/");
  const match = normalized.match(/^LSET(\d+)\/L(\d+)\.WDL$/iu);
  if (!match) {
    return null;
  }
  return (Number.parseInt(match[1], 10) - 1) * 10 + Number.parseInt(match[2], 10);
}

function parseLsetWdl(data) {
  if (data.length < 0x38) {
    return null;
  }
  const headerSize = readU32LE(data, 0);
  if (headerSize !== 0x34 || headerSize > data.length) {
    return null;
  }

  const headerWords = [];
  for (let offset = 0; offset < headerSize; offset += 4) {
    headerWords.push(readU32LE(data, offset));
  }
  const audioSize = headerWords[1];
  const postAudioStart = headerSize + audioSize;
  const sectionSizes = [];
  for (let offset = 0x08; offset < 0x38; offset += 4) {
    sectionSizes.push(readU32LE(data, offset));
  }
  const sections = [];
  let sectionCursor = postAudioStart;
  for (let index = 0; index < sectionSizes.length; index += 1) {
    const size = sectionSizes[index];
    if (size <= 0 || sectionCursor + size > data.length) {
      break;
    }
    sections.push({
      name: `post_audio_section_${String(index).padStart(2, "0")}`,
      offset: sectionCursor,
      size
    });
    sectionCursor += size;
  }
  const highBoundaries = [...new Set(headerWords.slice(2).filter((value) => value >= postAudioStart && value < data.length))]
    .sort((left, right) => left - right);
  const boundaries = [postAudioStart, ...highBoundaries, data.length];
  const regions = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) {
      continue;
    }
    regions.push({
      name: `post_audio_region_${String(index).padStart(2, "0")}`,
      offset: start,
      size: end - start
    });
  }
  return {
    headerWords,
    sectionSizes,
    sections,
    regions
  };
}

function readSectionBytes(data, section) {
  return data.subarray(section.offset, section.offset + section.size);
}

function parseTypedSection8(data, section, startOffset = 0) {
  const sourceBytes = readSectionBytes(data, section);
  if (startOffset < 0 || startOffset >= sourceBytes.length) {
    return null;
  }
  const sectionBytes = sourceBytes.subarray(startOffset);
  if (sectionBytes.length < 8) {
    return null;
  }

  const recordCount = readU32LE(sectionBytes, 0);
  const payloadBytes = readU32LE(sectionBytes, 4);
  const headerOffset = 8 + payloadBytes;
  if (recordCount <= 0 || recordCount > 0x400) {
    return null;
  }
  if (payloadBytes < 0 || headerOffset + recordCount * 8 > sectionBytes.length) {
    return null;
  }

  let payloadCursor = 8;
  const records = [];
  for (let index = 0; index < recordCount; index += 1) {
    const descriptorOffset = headerOffset + index * 8;
    const blockSize = readU32LE(sectionBytes, descriptorOffset);
    const typeId = readU32LE(sectionBytes, descriptorOffset + 4);
    if (blockSize < 0 || payloadCursor + blockSize > headerOffset) {
      return null;
    }
    const payload = sectionBytes.subarray(payloadCursor, payloadCursor + blockSize);
    const payloadDwords = [];
    for (let offset = 0; offset + 4 <= payload.length; offset += 4) {
      payloadDwords.push(readU32LE(payload, offset));
    }
    records.push({
      index,
      typeId,
      blockSize,
      payloadKind: payload.length >= 4 ? readU32LE(payload, 0) : null,
      payloadPreviewDwords: payloadDwords.slice(0, 8),
      payloadDwords,
      payloadBytesBase64: payload.toString("base64")
    });
    payloadCursor += blockSize;
  }

  return {
    kind: "typed-section-8",
    sectionName: section.name,
    sectionOffset: section.offset,
    sectionSize: section.size,
    parseOffset: startOffset,
    parseAbsoluteOffset: section.offset + startOffset,
    recordCount,
    payloadBytes,
    headerOffset,
    records
  };
}

function parseTypedSection16(data, section, startOffset = 0) {
  const sourceBytes = readSectionBytes(data, section);
  if (startOffset < 0 || startOffset >= sourceBytes.length) {
    return null;
  }
  const sectionBytes = sourceBytes.subarray(startOffset);
  if (sectionBytes.length < 8) {
    return null;
  }

  const recordCount = readU32LE(sectionBytes, 0);
  const payloadBytes = readU32LE(sectionBytes, 4);
  const headerOffset = 8 + payloadBytes;
  if (recordCount <= 0 || recordCount > 0x400) {
    return null;
  }
  if (payloadBytes < 0 || headerOffset + recordCount * 16 > sectionBytes.length) {
    return null;
  }

  let payloadCursor = 8;
  const records = [];
  for (let index = 0; index < recordCount; index += 1) {
    const descriptorOffset = headerOffset + index * 16;
    const d4Size = readU32LE(sectionBytes, descriptorOffset);
    const ccSize = readU32LE(sectionBytes, descriptorOffset + 4);
    const d0Size = readU32LE(sectionBytes, descriptorOffset + 8);
    const typeId = readU16LE(sectionBytes, descriptorOffset + 12);
    const variantTypeId = readU16LE(sectionBytes, descriptorOffset + 14);
    const ccOffset = payloadCursor;
    const d0Offset = ccOffset + ccSize;
    const d4Offset = d0Offset + d0Size;
    const endOffset = d4Offset + d4Size;
    if (endOffset > headerOffset) {
      return null;
    }
    const ccPayload = sectionBytes.subarray(ccOffset, ccOffset + ccSize);
    const d0Payload = sectionBytes.subarray(d0Offset, d0Offset + d0Size);
    const d4Payload = sectionBytes.subarray(d4Offset, d4Offset + d4Size);
    records.push({
      index,
      typeId,
      variantTypeId,
      ccSize,
      d0Size,
      d4Size,
      ccBytesBase64: ccPayload.toString("base64"),
      d0BytesBase64: d0Payload.toString("base64"),
      d4BytesBase64: d4Payload.toString("base64")
    });
    payloadCursor = endOffset;
  }

  return {
    kind: "typed-section-16",
    sectionName: section.name,
    sectionOffset: section.offset,
    sectionSize: section.size,
    parseOffset: startOffset,
    parseAbsoluteOffset: section.offset + startOffset,
    recordCount,
    payloadBytes,
    headerOffset,
    records
  };
}

function countTypeOverlap(candidate, requestedTypeIds) {
  let overlap = 0;
  for (const record of candidate.records) {
    if (requestedTypeIds.has(record.typeId)) {
      overlap += 1;
    }
  }
  return overlap;
}

function findTypedSectionCandidates(data, parsed, parser, requestedTypeIds, startOffsets = [0, 0x38]) {
  const candidates = [];
  for (const section of parsed.sections) {
    for (const startOffset of startOffsets) {
      const candidate = parser(data, section, startOffset);
      if (!candidate) {
        continue;
      }
      candidate.typeOverlap = countTypeOverlap(candidate, requestedTypeIds);
      candidates.push(candidate);
    }
  }
  return candidates;
}

function createBitReader(bytes) {
  return {
    bytes,
    cursor: 0,
    current: 0,
    mask: 0,
    readBit() {
      if (this.mask === 0) {
        if (this.cursor >= this.bytes.length) {
          return null;
        }
        this.current = this.bytes[this.cursor];
        this.cursor += 1;
        this.mask = 0x80;
      }
      const value = (this.current & this.mask) !== 0 ? 1 : 0;
      this.mask >>= 1;
      return value;
    },
    readBitsWithMask(startMask) {
      let value = 0;
      for (let mask = startMask; mask !== 0; mask >>= 1) {
        const bit = this.readBit();
        if (bit === null) {
          return null;
        }
        if (bit) {
          value |= mask;
        }
      }
      return value;
    }
  };
}

function decompressPsxLevelState(sourceBytes, outputSize = PSX_DECOMPRESSED_LEVEL_SIZE) {
  const reader = createBitReader(sourceBytes);
  const output = Buffer.alloc(outputSize);
  const ring = Buffer.alloc(PSX_LEVEL_RING_SIZE);
  let ringIndex = 1;
  let outputOffset = 0;
  let terminatedBy = "source-exhausted";

  while (outputOffset < outputSize) {
    const controlBit = reader.readBit();
    if (controlBit === null) {
      break;
    }

    if (controlBit !== 0) {
      const literal = reader.readBitsWithMask(0x80);
      if (literal === null) {
        break;
      }
      output[outputOffset] = literal;
      ring[ringIndex] = literal;
      outputOffset += 1;
      ringIndex = (ringIndex + 1) & 0x7f;
      continue;
    }

    const offsetBase = reader.readBitsWithMask(0x40);
    if (offsetBase === null) {
      break;
    }
    if (offsetBase === 0) {
      terminatedBy = "end-marker";
      break;
    }
    const copyLengthRaw = reader.readBitsWithMask(0x80);
    if (copyLengthRaw === null) {
      break;
    }
    const copyLength = copyLengthRaw + 1;
    for (let index = 0; index < copyLength && outputOffset < outputSize; index += 1) {
      const value = ring[(offsetBase + index) & 0x7f];
      output[outputOffset] = value;
      ring[ringIndex] = value;
      outputOffset += 1;
      ringIndex = (ringIndex + 1) & 0x7f;
    }
  }

  return {
    ok: outputOffset === outputSize,
    output: output.subarray(0, outputOffset),
    outputSize: outputOffset,
    consumedBytes: reader.cursor,
    terminatedBy
  };
}

function findBestTypedSection8(data, parsed, records) {
  const requestedTypeIds = new Set(records.map((record) => record.u0));
  const candidates = findTypedSectionCandidates(data, parsed, parseTypedSection8, requestedTypeIds)
    .sort((left, right) => {
      const leftKind45Count = left.records.filter((record) => record.payloadKind === 4 || record.payloadKind === 5).length;
      const rightKind45Count = right.records.filter((record) => record.payloadKind === 4 || record.payloadKind === 5).length;
      return right.typeOverlap - left.typeOverlap || rightKind45Count - leftKind45Count || right.recordCount - left.recordCount || right.payloadBytes - left.payloadBytes;
    });
  return candidates[0] ?? null;
}

function findBestTypedSection16(data, parsed, records) {
  const requestedTypeIds = new Set(records.map((record) => record.u0));
  const candidates = findTypedSectionCandidates(data, parsed, parseTypedSection16, requestedTypeIds)
    .sort((left, right) => right.typeOverlap - left.typeOverlap || right.recordCount - left.recordCount || right.payloadBytes - left.payloadBytes);
  return candidates[0] ?? null;
}

function findBestCompressedLevelSection(data, parsed) {
  const candidates = parsed.sections
    .filter((section) => section.size > 0 && section.size <= 0x2000)
    .map((section) => {
      const decode = decompressPsxLevelState(readSectionBytes(data, section));
      return {
        section,
        decode,
        score: (decode.ok ? 100000 : 0) + decode.outputSize - decode.consumedBytes
      };
    })
    .sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function matchTemplateBundles(templateSection, spriteBundles, graphicsRegionOffset) {
  const absoluteBundleOffsets = new Map(spriteBundles.map((bundle) => [bundle.offset >>> 0, bundle]));
  const relativeBundleOffsets = new Map(spriteBundles.map((bundle) => [((bundle.offset - graphicsRegionOffset) >>> 0), bundle]));
  const bundleIndexes = new Map(spriteBundles.map((bundle, index) => [index >>> 0, bundle]));
  const matchesByType = {};

  for (const record of templateSection?.records ?? []) {
    let best = null;
    for (const value of record.payloadDwords ?? []) {
      if (absoluteBundleOffsets.has(value)) {
        best = { matchKind: "payload-dword-absolute-offset", bundle: absoluteBundleOffsets.get(value), matchedValue: value };
        break;
      }
      if (relativeBundleOffsets.has(value)) {
        best = { matchKind: "payload-dword-region04-offset", bundle: relativeBundleOffsets.get(value), matchedValue: value };
        break;
      }
      if (!best && bundleIndexes.has(value)) {
        best = { matchKind: "payload-dword-bundle-index", bundle: bundleIndexes.get(value), matchedValue: value };
      }
    }
    if (!best) {
      continue;
    }
    matchesByType[String(record.typeId)] = {
      matchKind: best.matchKind,
      matchedValue: toHex32(best.matchedValue),
      bundleOffset: best.bundle.offset,
      bundleMode: best.bundle.mode,
      resolvedPaletteIndex: best.bundle.resolvedPaletteIndex
    };
  }

  return matchesByType;
}

function collectPsxRuntimeState(data, parsed, records) {
  const graphicsRegion = parsed.regions.find((region) => region.name === "post_audio_region_04") ?? null;
  const spriteBundles = resolveSpriteBundlesForMap(data, parsed);
  const templateSection = findBestTypedSection8(data, parsed, records);
  const compoundSection = findBestTypedSection16(data, parsed, records);
  const compressedSection = findBestCompressedLevelSection(data, parsed);
  const templateMatches = matchTemplateBundles(templateSection, spriteBundles, graphicsRegion?.offset ?? 0);
  const stateLayers = [];

  if (templateSection) {
    stateLayers.push({
      id: "type-art-template-bank",
      runtimeTarget: "DAT_800758d8",
      role: "per-type-art-template",
      sectionName: templateSection.sectionName,
      sectionOffset: templateSection.sectionOffset,
      sectionSize: templateSection.sectionSize,
      parseOffset: templateSection.parseOffset,
      parseAbsoluteOffset: templateSection.parseAbsoluteOffset,
      typeOverlap: templateSection.typeOverlap,
      recordCount: templateSection.recordCount,
      payloadBytes: templateSection.payloadBytes,
      bytesBase64: readSectionBytes(data, parsed.sections.find((section) => section.name === templateSection.sectionName)).toString("base64"),
      records: templateSection.records.map((record) => ({
        ...record,
        bundleMatch: templateMatches[String(record.typeId)] ?? null
      }))
    });
  }

  if (compoundSection) {
    stateLayers.push({
      id: "compound-state-offset-bank",
      runtimeTarget: "DAT_800758cc",
      role: "per-type-compound-state-offsets",
      sectionName: compoundSection.sectionName,
      sectionOffset: compoundSection.sectionOffset,
      sectionSize: compoundSection.sectionSize,
      parseOffset: compoundSection.parseOffset,
      parseAbsoluteOffset: compoundSection.parseAbsoluteOffset,
      typeOverlap: compoundSection.typeOverlap,
      recordCount: compoundSection.recordCount,
      payloadBytes: compoundSection.payloadBytes,
      records: compoundSection.records.map((record) => ({
        index: record.index,
        typeId: record.typeId,
        variantTypeId: record.variantTypeId,
        ccSize: record.ccSize,
        ccBytesBase64: record.ccBytesBase64
      }))
    });
    stateLayers.push({
      id: "simple-component-bank",
      runtimeTarget: "DAT_800758d0",
      role: "per-type-simple-component",
      sectionName: compoundSection.sectionName,
      sectionOffset: compoundSection.sectionOffset,
      sectionSize: compoundSection.sectionSize,
      parseOffset: compoundSection.parseOffset,
      parseAbsoluteOffset: compoundSection.parseAbsoluteOffset,
      typeOverlap: compoundSection.typeOverlap,
      recordCount: compoundSection.recordCount,
      payloadBytes: compoundSection.payloadBytes,
      records: compoundSection.records.map((record) => ({
        index: record.index,
        typeId: record.typeId,
        variantTypeId: record.variantTypeId,
        d0Size: record.d0Size,
        d0BytesBase64: record.d0BytesBase64
      }))
    });
    stateLayers.push({
      id: "compound-variant-bank",
      runtimeTarget: "DAT_800758d4",
      role: "per-type-compound-variants",
      sectionName: compoundSection.sectionName,
      sectionOffset: compoundSection.sectionOffset,
      sectionSize: compoundSection.sectionSize,
      parseOffset: compoundSection.parseOffset,
      parseAbsoluteOffset: compoundSection.parseAbsoluteOffset,
      typeOverlap: compoundSection.typeOverlap,
      recordCount: compoundSection.recordCount,
      payloadBytes: compoundSection.payloadBytes,
      records: compoundSection.records.map((record) => ({
        index: record.index,
        typeId: record.typeId,
        variantTypeId: record.variantTypeId,
        d4Size: record.d4Size,
        d4BytesBase64: record.d4BytesBase64
      }))
    });
  }

  if (compressedSection) {
    stateLayers.push({
      id: "compressed-level-state-source",
      runtimeTarget: "DAT_8006b5d8",
      role: "compressed-level-state-source",
      sectionName: compressedSection.section.name,
      sectionOffset: compressedSection.section.offset,
      sectionSize: compressedSection.section.size,
      compressedBytesBase64: readSectionBytes(data, compressedSection.section).toString("base64"),
      decompressedBytesBase64: compressedSection.decode.output.toString("base64"),
      decompressedSize: compressedSection.decode.outputSize,
      consumedBytes: compressedSection.decode.consumedBytes,
      terminatedBy: compressedSection.decode.terminatedBy,
      ok: compressedSection.decode.ok
    });
  }

  return {
    spriteBundles,
    templateMatches,
    stateLayers
  };
}

function getPsxRecordFamilyProfile(sourceFamily) {
  if (sourceFamily === PSX_FAMILY_SECTION0_ROOT) {
    return {
      role: "root-dispatch",
      opacity: 0.45,
      drawPriority: 10,
      description: "Section-0 top-level dispatch/root records consumed by constructor dispatch helpers"
    };
  }
  if (sourceFamily === PSX_FAMILY_SECTION0_BULK) {
    return {
      role: "constructor-placement",
      opacity: 1,
      drawPriority: 20,
      description: "Section-0 dense constructor-fed placement records"
    };
  }
  return {
    role: "unknown",
    opacity: 0.8,
    drawPriority: 50,
    description: "Structured PSX record family"
  };
}

function isStructuredCandidate(record) {
  if (record.u0 >= 0x200) {
    return false;
  }
  if (record.u1 === 0 && record.u2 === 0) {
    return false;
  }
  if (record.u1 >= 0x4000 || record.u2 >= 0x4000) {
    return false;
  }
  if (record.u3 > 0x20 || record.u4 > 0x04) {
    return false;
  }
  if (!ALLOWED_U5.has(record.u5)) {
    return false;
  }
  return true;
}

function extractRegion01Records(data, region) {
  const rows = [];
  const regionBytes = data.subarray(region.offset, region.offset + region.size);
  const usableSize = regionBytes.length - (regionBytes.length % 24);
  for (let offset = 0, rowIndex = 0; offset < usableSize; offset += 24, rowIndex += 1) {
    for (const [side, sideOffset] of [["left", 0], ["right", 12]]) {
      const base = offset + sideOffset;
      const record = {
        side,
        rowIndex,
        recordIndex: rowIndex * 2 + (side === "right" ? 1 : 0),
        u0: readU16LE(regionBytes, base),
        u1: readU16LE(regionBytes, base + 2),
        u2: readU16LE(regionBytes, base + 4),
        u3: readU16LE(regionBytes, base + 6),
        u4: readU16LE(regionBytes, base + 8),
        u5: readU16LE(regionBytes, base + 10)
      };
      if (isStructuredCandidate(record)) {
        rows.push(record);
      }
    }
  }
  rows.sort((left, right) => left.u2 - right.u2 || left.u1 - right.u1 || left.u5 - right.u5 || left.u4 - right.u4 || left.u0 - right.u0 || left.recordIndex - right.recordIndex);
  return rows;
}

function normalizeRegion00Record(words, rowIndex, side) {
  const record = side === "left"
    ? {
        u0: words[4],
        u1: words[5],
        u2: words[0],
        u3: words[1],
        u4: words[2],
        u5: words[3]
      }
    : {
        u0: words[10],
        u1: words[11],
        u2: words[6],
        u3: words[7],
        u4: words[8],
        u5: words[9]
      };
  return {
    ...record,
    side,
    rowIndex,
    recordIndex: rowIndex * 2 + (side === "right" ? 1 : 0)
  };
}

function extractRegion00Records(data, region) {
  const regionBytes = data.subarray(region.offset, region.offset + region.size);
  if (regionBytes.length < 4) {
    return [];
  }

  const rowCount = readU32LE(regionBytes, 0);
  const rows = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const base = 4 + rowIndex * 24;
    if (base + 24 > regionBytes.length) {
      break;
    }

    const words = [];
    for (let wordIndex = 0; wordIndex < 12; wordIndex += 1) {
      words.push(readU16LE(regionBytes, base + wordIndex * 2));
    }

    for (const side of ["left", "right"]) {
      const record = normalizeRegion00Record(words, rowIndex, side);
      if (isStructuredCandidate(record)) {
        rows.push(record);
      }
    }
  }

  rows.sort((left, right) => left.u2 - right.u2 || left.u1 - right.u1 || left.u5 - right.u5 || left.u4 - right.u4 || left.u0 - right.u0 || left.recordIndex - right.recordIndex);
  return rows;
}

function buildPsxRecordFamily(sourceFamily, region, records, legacySourceFamily = null) {
  if (!records.length) {
    return null;
  }
  const profile = getPsxRecordFamilyProfile(sourceFamily);
  return {
    sourceFamily,
    legacySourceFamily,
    role: profile.role,
    opacity: profile.opacity,
    drawPriority: profile.drawPriority,
    description: profile.description,
    regionName: region.name,
    regionOffset: region.offset,
    regionSize: region.size,
    recordCount: records.length,
    records: records.map((record) => ({
      ...record,
      sourceFamily,
      legacySourceFamily,
      sourceRole: profile.role,
      sourceOpacity: profile.opacity,
      sourceDrawPriority: profile.drawPriority,
      sourceDescription: profile.description,
      sourceRegionName: region.name,
      sourceRegionOffset: region.offset,
      sourceRegionSize: region.size
    }))
  };
}

function getPsxRecordElevation(record) {
  if (record.sourceFamily === PSX_FAMILY_SECTION0_BULK || record.legacySourceFamily === "region01") {
    return record.u3 & 0xff;
  }
  return 0;
}

function buildDecodedRuntimeLayers(mapEntry) {
  const typeCount = [...new Set(mapEntry.records.map((record) => record.u0))].length;
  const layers = [
    {
      id: "section0-root-dispatch-layer",
      status: mapEntry.region00RecordCount ? "exported" : "missing",
      runtimeTarget: "DAT_800678f4 / DAT_80067720",
      sourceFamily: PSX_FAMILY_SECTION0_ROOT,
      role: "root-dispatch",
      recordCount: mapEntry.region00RecordCount,
      note: "Section-0 top-level dispatch/root records already exported as visible scene items."
    },
    {
      id: "section0-constructor-placement-layer",
      status: mapEntry.region01RecordCount ? "exported" : "missing",
      runtimeTarget: "subordinate constructor-fed placement family",
      sourceFamily: PSX_FAMILY_SECTION0_BULK,
      role: "constructor-placement",
      recordCount: mapEntry.region01RecordCount,
      note: "Section-0 dense constructor-fed placement records already exported as visible scene items."
    }
  ];

  for (const layer of mapEntry.runtimeState?.stateLayers ?? []) {
    layers.push({
      ...layer,
      status: "exported",
      observedTypeCount: typeCount
    });
  }

  return layers;
}

export function collectPsxRecordFamilies(data) {
  const parsed = parseLsetWdl(data);
  if (!parsed) {
    return [];
  }

  const families = [];
  const section00 = parsed.sections[0];
  if (section00) {
    const family = buildPsxRecordFamily(PSX_FAMILY_SECTION0_ROOT, section00, extractRegion00Records(data, section00), "region00");
    if (family) {
      families.push(family);
    }

    const bulkFamily = buildPsxRecordFamily(PSX_FAMILY_SECTION0_BULK, section00, extractRegion01Records(data, section00), "region01");
    if (bulkFamily) {
      families.push(bulkFamily);
    }
  } else {
    const region00 = parsed.regions.find((region) => region.name === "post_audio_region_00");
    if (region00) {
      const family = buildPsxRecordFamily(PSX_FAMILY_SECTION0_ROOT, region00, extractRegion00Records(data, region00), "region00");
      if (family) {
        families.push(family);
      }
    }

    const region01 = parsed.regions.find((region) => region.name === "post_audio_region_01");
    if (region01) {
      const family = buildPsxRecordFamily(PSX_FAMILY_SECTION0_BULK, region01, extractRegion01Records(data, region01), "region01");
      if (family) {
        families.push(family);
      }
    }
  }

  return families.sort((left, right) => left.drawPriority - right.drawPriority || left.regionOffset - right.regionOffset);
}

function colorFromKey(typeId, variant, lane) {
  const seed = (typeId * 1103515245 + variant * 12345 + lane * 2654435761) >>> 0;
  let red = 64 + (seed & 0x7f);
  let green = 72 + ((seed >>> 7) & 0x7f);
  let blue = 80 + ((seed >>> 14) & 0x7f);
  if (lane === 0x22) {
    green += 24;
  } else if (lane === 0x30) {
    blue += 28;
  }
  return [clampByte(red), clampByte(green), clampByte(blue)];
}

function placeholderGeometry(lane) {
  if (lane === 0x30) {
    return { width: 64, height: 64, originX: 32, originY: 52 };
  }
  if (lane === 0x22) {
    return { width: 64, height: 40, originX: 32, originY: 28 };
  }
  return { width: 64, height: 32, originX: 32, originY: 20 };
}

function setPixel(buffer, width, x, y, rgba) {
  if (x < 0 || y < 0 || x >= width) {
    return;
  }
  const index = (y * width + x) * 4;
  if (index < 0 || index + 3 >= buffer.length) {
    return;
  }
  buffer[index] = rgba[0];
  buffer[index + 1] = rgba[1];
  buffer[index + 2] = rgba[2];
  buffer[index + 3] = rgba[3];
}

function buildPlaceholderPng(typeId, variant, lane) {
  const geometry = placeholderGeometry(lane);
  const { width, height, originX, originY } = geometry;
  const buffer = Buffer.alloc(width * height * 4);
  const fill = colorFromKey(typeId, variant, lane);
  const border = fill.map((channel) => clampByte(channel - 36));
  const top = lane === 0x30 ? 16 : 4;
  const midY = top + 8;
  const bottom = height - 4;
  const centerX = Math.floor(width / 2);
  const halfSpan = Math.floor(width / 2) - 4;
  for (let y = top; y < bottom; y += 1) {
    if (lane === 0x30 && y < midY) {
      continue;
    }
    const rel = (y - midY) / Math.max(1, bottom - midY);
    const span = Math.max(4, Math.floor(halfSpan * (1 - Math.abs(rel))));
    const left = centerX - span;
    const right = centerX + span;
    for (let x = left; x <= right; x += 1) {
      const rgba = x === left || x === right || y === top || y === bottom || y === midY
        ? [border[0], border[1], border[2], 255]
        : [fill[0], fill[1], fill[2], 220];
      setPixel(buffer, width, x, y, rgba);
    }
  }
  if (lane === 0x30) {
    for (let y = 8; y < midY; y += 1) {
      const left = centerX - 12;
      const right = centerX + 12;
      for (let x = left; x <= right; x += 1) {
        const rgba = x === left || x === right
          ? [border[0], border[1], border[2], 255]
          : [fill[0], fill[1], fill[2], 208];
        setPixel(buffer, width, x, y, rgba);
      }
    }
  }
  const stripeCount = Math.min(variant, 3);
  for (let stripe = 0; stripe < stripeCount; stripe += 1) {
    const stripeY = bottom - 6 - stripe * 4;
    for (let x = centerX - 10; x <= centerX + 10; x += 1) {
      setPixel(buffer, width, x, stripeY, [255, 255, 255, 220]);
    }
  }
  return {
    png: encodePng(width, height, buffer),
    width,
    height,
    originX,
    originY
  };
}

function sanitizeOrigin(originX, originY, width, height) {
  let cleanX = originX;
  let cleanY = originY;
  if (cleanX < 0 || cleanX > width * 4) {
    cleanX = Math.trunc(width / 2);
  }
  if (cleanY < 0 || cleanY > height * 4) {
    cleanY = Math.max(0, height - 1);
  }
  return {
    originX: cleanX,
    originY: cleanY
  };
}

function psx555ToRgba(color) {
  const red = Math.trunc((color & 0x1f) * 255 / 31);
  const green = Math.trunc(((color >> 5) & 0x1f) * 255 / 31);
  const blue = Math.trunc(((color >> 10) & 0x1f) * 255 / 31);
  const alpha = (color & 0x7fff) === 0 ? 0 : 255;
  return [red, green, blue, alpha];
}

function extractPaletteSets(data, headerWords) {
  if (!Array.isArray(headerWords) || headerWords.length < 4) {
    return [];
  }
  const paletteOffset = headerWords[2];
  const paletteSize = headerWords[3];
  if (paletteSize !== 0x1000 || paletteOffset + paletteSize > data.length) {
    return [];
  }
  const blob = data.subarray(paletteOffset, paletteOffset + paletteSize);
  const palettes = [];
  for (let offset = 0; offset + 0x20 <= blob.length; offset += 0x20) {
    const palette = [];
    for (let entryOffset = 0; entryOffset < 0x20; entryOffset += 2) {
      palette.push(readU16LE(blob, offset + entryOffset));
    }
    palettes.push(palette);
  }
  return palettes;
}

function extractPaletteBlocks256(data, headerWords) {
  if (!Array.isArray(headerWords) || headerWords.length < 4) {
    return [];
  }
  const paletteOffset = headerWords[2];
  const paletteSize = headerWords[3];
  if (paletteSize !== 0x1000 || paletteOffset + paletteSize > data.length) {
    return [];
  }
  const blob = data.subarray(paletteOffset, paletteOffset + paletteSize);
  const palettes = [];
  for (let offset = 0; offset + 0x200 <= blob.length; offset += 0x200) {
    const palette = [];
    for (let entryOffset = 0; entryOffset < 0x200; entryOffset += 2) {
      palette.push(readU16LE(blob, offset + entryOffset));
    }
    palettes.push(palette);
  }
  return palettes;
}

function choosePalette(palettes, frames, mode) {
  if (mode !== 2 || !palettes.length) {
    return null;
  }

  const usedIndices = new Set();
  for (const frame of frames) {
    for (const byte of frame.pixels) {
      usedIndices.add(byte & 0x0f);
      usedIndices.add((byte >> 4) & 0x0f);
    }
  }
  usedIndices.delete(0);
  if (!usedIndices.size) {
    return 0;
  }

  let bestIndex = null;
  let bestScore = -1;
  for (let paletteIndex = 0; paletteIndex < palettes.length; paletteIndex += 1) {
    const distinct = new Set([...usedIndices].map((index) => palettes[paletteIndex][index] & 0x7fff));
    const nonzero = [...distinct].filter((value) => value !== 0);
    if (!nonzero.length) {
      continue;
    }

    let channelSpread = 0;
    for (const value of nonzero) {
      const [red, green, blue] = psx555ToRgba(value);
      channelSpread += red + green + blue;
    }

    const score = nonzero.length * 100000 + channelSpread;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = paletteIndex;
    }
  }
  return bestIndex;
}

function colorizeIndexedPixels(rawPixels, width, height, mode, palette, highNibbleFirst = false) {
  const rgba = Buffer.alloc(width * height * 4);
  if (mode === 2) {
    const rowBytes = Math.ceil(width / 2);
    let sourceOffset = 0;
    let targetOffset = 0;
    for (let row = 0; row < height; row += 1) {
      const rowSlice = rawPixels.subarray(sourceOffset, sourceOffset + rowBytes);
      sourceOffset += rowBytes;
      for (const byte of rowSlice) {
        const indices = highNibbleFirst ? [(byte >> 4) & 0x0f, byte & 0x0f] : [byte & 0x0f, (byte >> 4) & 0x0f];
        for (const index of indices) {
          if (targetOffset >= rgba.length) {
            break;
          }
          const [red, green, blue] = psx555ToRgba(palette[index]);
          rgba[targetOffset] = red;
          rgba[targetOffset + 1] = green;
          rgba[targetOffset + 2] = blue;
          rgba[targetOffset + 3] = index === 0 ? 0 : 255;
          targetOffset += 4;
        }
      }
    }
    return rgba;
  }

  const pixelCount = Math.min(rawPixels.length, width * height);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const [red, green, blue] = psx555ToRgba(palette[rawPixels[pixelIndex]]);
    const targetOffset = pixelIndex * 4;
    rgba[targetOffset] = red;
    rgba[targetOffset + 1] = green;
    rgba[targetOffset + 2] = blue;
    rgba[targetOffset + 3] = rawPixels[pixelIndex] === 0 ? 0 : 255;
  }
  return rgba;
}

function decodeRleRows(data, start, width, height, mode) {
  const rowBytes = mode === 2 ? Math.ceil(width / 2) : width;
  const expectedSize = rowBytes * height;
  const output = [];
  let cursor = start;
  let rows = 0;

  while (rows < height) {
    if (cursor >= data.length) {
      return null;
    }
    const control = data[cursor];
    cursor += 1;
    const signedControl = control < 0x80 ? control : control - 0x100;

    if (signedControl === 0) {
      rows += 1;
      continue;
    }

    if (signedControl < 0) {
      const count = control & 0x7f;
      if (cursor + count > data.length) {
        return null;
      }
      for (let index = 0; index < count; index += 1) {
        output.push(data[cursor + index]);
      }
      cursor += count;
    } else {
      if (cursor >= data.length) {
        return null;
      }
      for (let index = 0; index < signedControl; index += 1) {
        output.push(data[cursor]);
      }
      cursor += 1;
    }

    if (output.length > expectedSize) {
      return null;
    }
  }

  if (output.length !== expectedSize) {
    return null;
  }
  return {
    pixels: Buffer.from(output),
    consumed: cursor - start
  };
}

function tryParseSpriteBundle(data, baseOffset) {
  if (baseOffset + 0x34 > data.length) {
    return null;
  }

  const mode = readU32LE(data, baseOffset + 0x10);
  if (![1, 2].includes(mode)) {
    return null;
  }
  const paletteIndex = readU32LE(data, baseOffset + 0x14);
  if (paletteIndex > 127) {
    return null;
  }
  const frameCount = readU32LE(data, baseOffset + 0x20);
  if (frameCount === 0 || frameCount > 512) {
    return null;
  }
  const dataOffset = readU32LE(data, baseOffset + 0x1c);
  const recordTableSize = frameCount * 20;
  if (dataOffset < 0x34 + recordTableSize || baseOffset + dataOffset >= data.length) {
    return null;
  }

  const frames = [];
  for (let frameIndex = 0; frameIndex < Math.min(frameCount, 12); frameIndex += 1) {
    const recordOffset = baseOffset + 0x34 + frameIndex * 20;
    if (recordOffset + 20 > data.length) {
      return null;
    }

    const flags = readU32LE(data, recordOffset);
    const dataRel = readU32LE(data, recordOffset + 8);
    const width = readU16LE(data, recordOffset + 12);
    const height = readU16LE(data, recordOffset + 14);
    const origin = sanitizeOrigin(
      readU16LE(data, recordOffset + 16),
      readU16LE(data, recordOffset + 18),
      width,
      height
    );
    if (width === 0 || height === 0 || width > 512 || height > 512) {
      return null;
    }

    const rowBytes = mode === 2 ? Math.ceil(width / 2) : width;
    const dataStart = baseOffset + dataOffset + ((flags & 1) ? dataRel * 4 : dataRel);
    if (dataStart >= data.length) {
      return null;
    }

    let pixels = null;
    let consumed = 0;
    if (flags & 1) {
      const decoded = decodeRleRows(data, dataStart, width, height, mode);
      if (!decoded) {
        return null;
      }
      pixels = decoded.pixels;
      consumed = decoded.consumed;
    } else {
      const rawSize = rowBytes * height;
      if (dataStart + rawSize > data.length) {
        return null;
      }
      pixels = data.subarray(dataStart, dataStart + rawSize);
      consumed = rawSize;
    }

    frames.push({
      index: frameIndex,
      flags,
      width,
      height,
      originX: origin.originX,
      originY: origin.originY,
      dataStart,
      consumed,
      pixels
    });
  }

  return {
    offset: baseOffset,
    mode,
    paletteIndex,
    frameCount,
    dataOffset,
    frames
  };
}

function scanSpriteBundles(data, maxCandidates = null) {
  const candidates = [];
  const seenRanges = [];
  for (let offset = 0; offset <= data.length - 0x34; offset += 4) {
    const bundle = tryParseSpriteBundle(data, offset);
    if (!bundle) {
      continue;
    }

    const end = offset + bundle.dataOffset;
    if (seenRanges.some(([rangeStart, rangeEnd]) => rangeStart <= offset && offset < rangeEnd)) {
      continue;
    }
    seenRanges.push([offset, end]);
    candidates.push(bundle);
    if (maxCandidates !== null && candidates.length >= maxCandidates) {
      break;
    }
  }
  return candidates;
}

function buildAtlasPng(frames) {
  const padding = 2;
  const atlasWidth = frames.reduce((sum, frame) => sum + frame.width, 0) + Math.max(0, frames.length - 1) * padding;
  const atlasHeight = Math.max(...frames.map((frame) => frame.height));
  const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);
  const rects = [];
  let cursorX = 0;

  for (const frame of frames) {
    for (let y = 0; y < frame.height; y += 1) {
      const sourceStart = y * frame.width * 4;
      const targetStart = (y * atlasWidth + cursorX) * 4;
      frame.rgba.copy(atlas, targetStart, sourceStart, sourceStart + frame.width * 4);
    }
    rects.push({
      frameIndex: frame.index,
      x: cursorX,
      y: 0,
      width: frame.width,
      height: frame.height,
      xoff: frame.originX,
      yoff: frame.originY
    });
    cursorX += frame.width + padding;
  }

  return {
    png: encodePng(atlasWidth, atlasHeight, atlas),
    width: atlasWidth,
    height: atlasHeight,
    rects
  };
}

function buildPackedAtlasImages(frameEntries) {
  const { atlases, placements } = packSprites(
    frameEntries.map((frame) => ({ id: frame.id, width: frame.width, height: frame.height })),
    { padding: 2 }
  );

  return atlases.map((atlas) => {
    const rgba = Buffer.alloc(atlas.width * atlas.height * 4);
    for (const sprite of atlas.sprites) {
      const frame = frameEntries.find((entry) => entry.id === sprite.id);
      if (!frame) {
        continue;
      }
      for (let y = 0; y < frame.height; y += 1) {
        const sourceStart = y * frame.width * 4;
        const targetStart = ((sprite.y + y) * atlas.width + sprite.x) * 4;
        frame.rgba.copy(rgba, targetStart, sourceStart, sourceStart + frame.width * 4);
      }
    }

    return {
      id: atlas.id,
      width: atlas.width,
      height: atlas.height,
      png: encodePng(atlas.width, atlas.height, rgba),
      placements
    };
  });
}

function projectPsxWorldToAnchor(worldX, worldY, worldZ = 0) {
  return {
    anchorX: (worldY - worldX) * PSX_SCREEN_SCALE,
    anchorY: (2 * worldZ - (worldX + worldY) / 2) * PSX_SCREEN_SCALE
  };
}

function projectAnchorToWorld(anchorX, anchorY, elevation = 0) {
  const normalizedAnchorX = anchorX / PSX_SCREEN_SCALE;
  const normalizedAnchorY = anchorY / PSX_SCREEN_SCALE;
  const adjustedAnchorY = normalizedAnchorY - 2 * elevation;
  const worldX = Math.trunc((-normalizedAnchorX - 2 * adjustedAnchorY) / 2);
  const worldY = Math.trunc((normalizedAnchorX - 2 * adjustedAnchorY) / 2);
  return {
    x: worldX,
    y: worldY,
    z: elevation
  };
}

function buildFallbackEntry(nextShapeCode, mapEntry, record, atlases, sprites, shapeDefinitions, catalogLines, fallbackByMapSpriteKey) {
  const fallbackKey = `${mapEntry.id}:${record.u0}:${record.u4}:${record.u5}`;
  const existing = fallbackByMapSpriteKey.get(fallbackKey);
  if (existing) {
    return existing;
  }

  const placeholder = buildPlaceholderPng(record.u0, record.u4, record.u5);
  const shapeCode = nextShapeCode.value;
  nextShapeCode.value += 1;
  const atlasId = `atlas-fallback-map-${mapEntry.id}-type-${record.u0.toString(16).padStart(4, "0")}-state-${record.u4}-lane-${record.u5.toString(16).padStart(4, "0")}`;
  const fileName = `map_${mapEntry.id}_fallback_type_${record.u0.toString(16).toUpperCase().padStart(4, "0")}_state_${record.u4}_lane_${record.u5.toString(16).toUpperCase().padStart(4, "0")}.png`;
  const displayName = `PSX fallback type ${record.u0.toString(16).toUpperCase().padStart(4, "0")} state ${record.u4} lane ${record.u5.toString(16).toUpperCase().padStart(4, "0")}`;
  const description = "Fallback placeholder for a PSX section-0 runtime record whose true art still depends on the executable state/type banks. This placeholder is preferred over the disproven scan-order sprite fallback.";
  fs.writeFileSync(path.join(PSX_REFERENCE_CACHE_ROOT, fileName), placeholder.png);
  atlases.push({
    id: atlasId,
    referenceId: PSX_REFERENCE_ID,
    fileName,
    width: placeholder.width,
    height: placeholder.height
  });
  sprites.push({
    id: `sprite:${shapeCode}:0`,
    referenceId: PSX_REFERENCE_ID,
    atlasId,
    shape: shapeCode,
    frame: 0,
    x: 0,
    y: 0,
    width: placeholder.width,
    height: placeholder.height,
    xoff: placeholder.originX,
    yoff: placeholder.originY
  });
  shapeDefinitions.push({
    id: `shape:${shapeCode}`,
    shape: shapeCode,
    shapeHex: toShapeCodeHex(shapeCode),
    family: null,
    label: "Terrain",
    kind: "terrain",
    displayName,
    description,
    dimensions: { x: 1, y: 1, z: 1 },
    visibilityTags: ["psx", "art-probe", "fallback"],
    traits: {
      editor: false,
      roof: false,
      oob: false,
      occluding: false,
      translucent: false,
      solid: false,
      fixed: false,
      land: true,
      draw: true,
      invitem: false,
      animType: 0
    },
    catalogEntry: {
      humanReadableId: displayName,
      description,
      roof: null,
      semitransparency: null,
      oob: null
    },
    catalogOverrides: { roof: null, semitransparency: null, oob: null },
    tableFallback: null
  });
  catalogLines.push(`${toShapeCodeHex(shapeCode)},${displayName},${description},,,,terrain,`);

  const fallback = {
    shapeCode,
    spriteId: `sprite:${shapeCode}:0`,
    bundleIndex: null,
    bundleOffset: null,
    resolvedPaletteIndex: null,
    mode: null,
    isFallback: true
  };
  fallbackByMapSpriteKey.set(fallbackKey, fallback);
  return fallback;
}

function parseStateSelectorFrameMap(ccBytesBase64) {
  if (!ccBytesBase64) {
    return null;
  }

  const bytes = Buffer.from(ccBytesBase64, "base64");
  if (bytes.length < 8) {
    return null;
  }

  const scriptCount = readU32LE(bytes, 0);
  if (scriptCount <= 0 || scriptCount > 0x100) {
    return null;
  }

  const headerBytes = 4 + scriptCount * 4;
  if (headerBytes > bytes.length) {
    return null;
  }

  const frameBySelector = {};
  const usedFrameIndexes = new Set();
  let mappedSelectorCount = 0;

  for (let selector = 0; selector < scriptCount; selector += 1) {
    const scriptOffset = readU32LE(bytes, 4 + selector * 4);
    if (scriptOffset < headerBytes || scriptOffset + 4 > bytes.length) {
      continue;
    }
    const frameIndex = readU16LE(bytes, scriptOffset);
    if (frameIndex === 0xffff) {
      continue;
    }
    frameBySelector[selector] = frameIndex;
    usedFrameIndexes.add(frameIndex);
    mappedSelectorCount += 1;
  }

  if (mappedSelectorCount === 0) {
    return null;
  }

  return {
    frameBySelector,
    usedFrameIndexes: [...usedFrameIndexes].sort((left, right) => left - right),
    scriptCount,
    mappedSelectorCount
  };
}

function buildVerifiedStateFrameMap(frameBySelector) {
  const usedFrameIndexes = [...new Set(Object.values(frameBySelector))].sort((left, right) => left - right);
  return {
    frameBySelector,
    usedFrameIndexes,
    scriptCount: Object.keys(frameBySelector).length,
    mappedSelectorCount: Object.keys(frameBySelector).length,
    source: "verified-fallback"
  };
}

function buildTypeStateFrameMaps(mapEntry) {
  const stateLayer = mapEntry.runtimeState?.stateLayers?.find((layer) => layer.runtimeTarget === "DAT_800758cc") ?? null;
  const frameMapsByType = new Map(
    [...VERIFIED_TYPE_STATE_FRAME_FALLBACKS.entries()].map(([typeId, frameBySelector]) => [typeId, buildVerifiedStateFrameMap(frameBySelector)])
  );
  if (!stateLayer) {
    return frameMapsByType;
  }

  for (const record of stateLayer.records ?? []) {
    const frameMap = parseStateSelectorFrameMap(record.ccBytesBase64);
    if (!frameMap) {
      continue;
    }
    frameMapsByType.set(record.typeId, frameMap);
  }

  return frameMapsByType;
}

function buildRealArtReference(mapEntries) {
  ensureDir(PSX_REFERENCE_CACHE_ROOT);
  const atlases = [];
  const sprites = [];
  const shapeDefinitions = [];
  const catalogLines = ["shape_code,human_readable_id,description,roof,semitransparency,OOB,categorization,qualities"];
  const bundleByMapAndIndex = new Map();
  const fallbackByMapSpriteKey = new Map();
  const nextShapeCode = { value: 0xA000 };
  const fingerprintMaterial = [];
  const rawFrames = [];
  const pendingArtEntries = [];

  for (const mapEntry of mapEntries) {
    const bundleByOffset = new Map(mapEntry.spriteBundles.map((bundle, index) => [bundle.offset, { ...bundle, scannedIndex: index }]));
    const stateFrameMapsByType = buildTypeStateFrameMaps(mapEntry);
    const requestedTypeIds = [...new Set(mapEntry.records.map((record) => record.u0))].sort((left, right) => left - right);
    for (const typeId of requestedTypeIds) {
      const templateMatch = mapEntry.runtimeState?.templateMatches?.[String(typeId)] ?? null;
      const matchedBundle = templateMatch?.bundleOffset != null ? bundleByOffset.get(templateMatch.bundleOffset) ?? null : null;
      const bundle = matchedBundle ?? null;
      if (!bundle?.frames?.length || !bundle.palette?.length) {
        continue;
      }
      const stateFrameMap = stateFrameMapsByType.get(typeId) ?? null;
      const usedFrameIndexes = (stateFrameMap?.usedFrameIndexes ?? [0]).filter((frameIndex) => frameIndex < bundle.frames.length);
      if (usedFrameIndexes.length === 0) {
        usedFrameIndexes.push(0);
      }

      const artFrames = usedFrameIndexes.map((frameIndex) => {
        const frame = bundle.frames[frameIndex];
        return {
          ...frame,
          id: `frame:map:${mapEntry.id}:type:${typeId}:frame:${frameIndex}`,
          rgba: colorizeIndexedPixels(frame.pixels, frame.width, frame.height, bundle.mode, bundle.palette)
        };
      });
      const shapeCode = nextShapeCode.value;
      nextShapeCode.value += 1;
      const displayName = `PSX map ${mapEntry.id} type ${typeId.toString(16).toUpperCase().padStart(4, "0")} offset ${bundle.offset.toString(16).toUpperCase().padStart(8, "0")}`;
      const description = stateFrameMap
        ? `PSX type-to-art probe resolved through the parsed per-type art-template bank using ${templateMatch.matchKind}. The scene renderer also uses the parsed DAT_800758cc state script to choose among ${usedFrameIndexes.length} frame(s) for this type.`
        : `PSX type-to-art probe resolved through the parsed per-type art-template bank using ${templateMatch.matchKind}. The scene renderer keeps frame 0 until the executable state-script path is decoded far enough to choose per-state animation frames.`;
      const spriteEntries = new Map();
      for (const frame of artFrames) {
        rawFrames.push(frame);
        spriteEntries.set(frame.index, {
          rawFrameId: frame.id,
          width: frame.width,
          height: frame.height,
          xoff: frame.originX,
          yoff: frame.originY
        });
      }
      pendingArtEntries.push({
        shapeCode,
        displayName,
        description,
        templateMatch,
        spriteEntries
      });
      catalogLines.push(`${toShapeCodeHex(shapeCode)},${displayName},${description},,,,terrain,`);
      fingerprintMaterial.push(`${mapEntry.id}:${typeId}:${bundle.offset}:${bundle.mode}:${bundle.resolvedPaletteIndex}:${usedFrameIndexes.join("-")}`);
      bundleByMapAndIndex.set(`${mapEntry.id}:${typeId}`, {
        shapeCode,
        bundleIndex: bundle.scannedIndex ?? typeId,
        bundleOffset: bundle.offset,
        resolvedPaletteIndex: bundle.resolvedPaletteIndex,
        mode: bundle.mode,
        mappingSource: templateMatch?.matchKind ?? "scan-order-index-fallback",
        stateFrameBySelector: stateFrameMap?.frameBySelector ?? null,
        spriteEntries
      });
    }
  }

  const packedAtlases = buildPackedAtlasImages(rawFrames);
  const framePlacementMap = packedAtlases[0]?.placements ?? new Map();
  for (const atlas of packedAtlases) {
    const fileName = `${atlas.id}.png`;
    fs.writeFileSync(path.join(PSX_REFERENCE_CACHE_ROOT, fileName), atlas.png);
    atlases.push({
      id: atlas.id,
      referenceId: PSX_REFERENCE_ID,
      fileName,
      width: atlas.width,
      height: atlas.height
    });
  }

  for (const entry of pendingArtEntries) {
    for (const [frameIndex, spriteEntry] of entry.spriteEntries) {
      const packed = framePlacementMap.get(spriteEntry.rawFrameId);
      if (!packed) {
        continue;
      }
      const spriteId = `sprite:${entry.shapeCode}:${frameIndex}`;
      sprites.push({
        id: spriteId,
        referenceId: PSX_REFERENCE_ID,
        atlasId: packed.atlasId,
        shape: entry.shapeCode,
        frame: frameIndex,
        x: packed.x,
        y: packed.y,
        width: packed.width,
        height: packed.height,
        xoff: spriteEntry.xoff,
        yoff: spriteEntry.yoff
      });
      spriteEntry.spriteId = spriteId;
      delete spriteEntry.rawFrameId;
    }

    shapeDefinitions.push({
      id: `shape:${entry.shapeCode}`,
      shape: entry.shapeCode,
      shapeHex: toShapeCodeHex(entry.shapeCode),
      family: null,
      label: "Terrain",
      kind: "terrain",
      displayName: entry.displayName,
      description: entry.description,
      dimensions: { x: 1, y: 1, z: 1 },
      visibilityTags: ["psx", "art-probe", entry.templateMatch ? "template-match" : "fallback-match"],
      traits: {
        editor: false,
        roof: false,
        oob: false,
        occluding: false,
        translucent: false,
        solid: false,
        fixed: false,
        land: true,
        draw: true,
        invitem: false,
        animType: 0
      },
      catalogEntry: {
        humanReadableId: entry.displayName,
        description: entry.description,
        roof: null,
        semitransparency: null,
        oob: null
      },
      catalogOverrides: { roof: null, semitransparency: null, oob: null },
      tableFallback: null
    });
  }

  for (const mapEntry of mapEntries) {
    for (const record of mapEntry.records) {
      const bundleKey = `${mapEntry.id}:${record.u0}`;
      if (!bundleByMapAndIndex.has(bundleKey)) {
        buildFallbackEntry(nextShapeCode, mapEntry, record, atlases, sprites, shapeDefinitions, catalogLines, fallbackByMapSpriteKey);
      }
    }
  }

  fs.writeFileSync(PSX_CATALOG_FILE, `${catalogLines.join("\n")}\n`, "utf8");
  const fingerprint = sha1(JSON.stringify({ version: PSX_REFERENCE_VERSION, fingerprintMaterial: fingerprintMaterial.sort() })).slice(0, 16);
  const payload = buildSceneReferencePayload(PSX_REFERENCE_ID, {
    shapeDefinitions,
    sprites,
    atlases,
    fingerprint
  }, [PSX_GAME_ID]);
  fs.writeFileSync(PSX_REFERENCE_DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    fingerprint,
    shapeDefinitions,
    sprites,
    atlases,
    bundleByMapAndIndex,
    fallbackByMapSpriteKey
  };
}

function buildSceneForMap(mapEntry, referenceData, fingerprint, relativePath) {
  const records = mapEntry.records;
  const decodedRuntimeLayers = buildDecodedRuntimeLayers(mapEntry);
  const spriteIndex = new Map(referenceData.sprites.map((sprite) => [sprite.id, sprite]));
  const laneCounts = {};
  const familyCounts = {};
  const zCounts = {};
  const sourceCounts = {};
  const items = [];
  let minScreenLeft = 0;
  let minScreenTop = 0;
  let finalRight = 0;
  let finalBottom = 0;
  let first = true;
  let fallbackFrameCount = 0;
  let resolvedBundleCount = 0;
  let fallbackItemCount = 0;

  for (let drawOrder = 0; drawOrder < records.length; drawOrder += 1) {
    const record = records[drawOrder];
    const bundleMapping = referenceData.bundleByMapAndIndex.get(`${mapEntry.id}:${record.u0}`) ?? null;
    const fallbackMapping = referenceData.fallbackByMapSpriteKey.get(`${mapEntry.id}:${record.u0}:${record.u4}:${record.u5}`) ?? null;

    let shapeCode = null;
    let spriteId = null;
    let mappingNote = null;
    let bundleOffset = null;
    let paletteIndex = null;
    let actualFrameIndex = 0;
    let isFallback = false;

    if (bundleMapping) {
      const spriteFrameIndexes = [...bundleMapping.spriteEntries.keys()].sort((left, right) => left - right);
      actualFrameIndex = bundleMapping.stateFrameBySelector?.[record.u4] ?? spriteFrameIndexes[0] ?? 0;
      if (actualFrameIndex !== record.u4) {
        fallbackFrameCount += 1;
      }
      const spriteEntry = bundleMapping.spriteEntries.get(actualFrameIndex) ?? bundleMapping.spriteEntries.values().next().value;
      shapeCode = bundleMapping.shapeCode;
      spriteId = spriteEntry.spriteId;
      bundleOffset = bundleMapping.bundleOffset;
      paletteIndex = bundleMapping.resolvedPaletteIndex;
      mappingNote = `type-to-art mapping: type=${record.u0} source=${bundleMapping.mappingSource} bundle_offset=0x${bundleOffset.toString(16).padStart(8, "0")} state_selector=${record.u4} chosen_frame=${actualFrameIndex} palette_index=${paletteIndex ?? -1}`;
      resolvedBundleCount += 1;
    } else if (fallbackMapping) {
      shapeCode = fallbackMapping.shapeCode;
      spriteId = fallbackMapping.spriteId;
      mappingNote = `fallback placeholder mapping: unresolved executable state/type art for type=${record.u0.toString(16).padStart(4, "0")} state_selector=${record.u4} lane=${record.u5.toString(16).padStart(4, "0")}`;
      isFallback = true;
      fallbackItemCount += 1;
    } else {
      continue;
    }

    const sprite = spriteIndex.get(spriteId);
    const worldZ = getPsxRecordElevation(record);
    const projected = projectPsxWorldToAnchor(record.u1, record.u2, worldZ);
    const anchorX = projected.anchorX;
    const anchorY = projected.anchorY;
    const screenLeft = anchorX - sprite.xoff;
    const screenTop = anchorY - sprite.yoff;

    if (first) {
      minScreenLeft = screenLeft;
      minScreenTop = screenTop;
      first = false;
    } else {
      minScreenLeft = Math.min(minScreenLeft, screenLeft);
      minScreenTop = Math.min(minScreenTop, screenTop);
    }

    finalRight = Math.max(finalRight, screenLeft + sprite.width);
    finalBottom = Math.max(finalBottom, screenTop + sprite.height);
    laneCounts[toShapeCodeHex(record.u5)] = (laneCounts[toShapeCodeHex(record.u5)] ?? 0) + 1;

    items.push({
      id: `item:${drawOrder}:psx-${record.sourceFamily}:${record.side}:${record.rowIndex}`,
      mapSourceIndex: drawOrder,
      drawOrder,
      kind: "terrain",
      label: "Terrain",
      source: isFallback ? `psx-${record.sourceFamily}-fallback` : `psx-${record.sourceFamily}-art`,
      world: {
        x: record.u1,
        y: record.u2,
        z: worldZ
      },
      mapNum: record.u5,
      npcNum: record.u4,
      nextItem: 0,
      quality: record.u0,
      frame: actualFrameIndex,
      screen: {
        left: screenLeft,
        top: screenTop,
        right: screenLeft + sprite.width,
        bottom: screenTop + sprite.height,
        width: sprite.width,
        height: sprite.height,
        anchorX,
        anchorY
      },
      flags: {
        raw: record.u3,
        hex: toShapeCodeHex(record.u3),
        invisible: false,
        flipped: false
      },
      presentation: {
        opacity: isFallback ? Math.min(record.sourceOpacity ?? 1, 0.45) : (record.sourceOpacity ?? 1),
        visibilityDefault: record.sourceFamily !== PSX_FAMILY_SECTION0_ROOT
      },
      notes: [
        `PSX ${record.sourceFamily} (${record.sourceRole}) art probe record ${record.side} row ${record.rowIndex}`,
        `raw words: ${record.u0.toString(16).padStart(4, "0")} ${record.u1.toString(16).padStart(4, "0")} ${record.u2.toString(16).padStart(4, "0")} ${record.u3.toString(16).padStart(4, "0")} ${record.u4.toString(16).padStart(4, "0")} ${record.u5.toString(16).padStart(4, "0")}`,
        mappingNote,
        `record family: ${record.sourceFamily} at 0x${record.sourceRegionOffset.toString(16).padStart(8, "0")} (${record.sourceDescription})${record.legacySourceFamily ? ` legacy_alias=${record.legacySourceFamily}` : ""}`,
        "record word u4 is now treated as a state/script selector candidate from the object constructors, not as a verified sprite frame index",
        (record.sourceFamily === PSX_FAMILY_SECTION0_BULK || record.legacySourceFamily === "region01")
          ? `decoded elevation: z=${worldZ} from low byte of raw word u3=0x${record.u3.toString(16).padStart(4, "0")} using the constructor-backed +0x06 byte lane`
          : "decoded elevation: z=0 retained for the top-level descriptor family until its constructor-backed height source is proven",
        "screen anchor uses the executable-backed PSX projection basis screen_x = y - x, screen_y = 2*z - (x + y)/2"
      ],
      frameSize: {
        width: sprite.width,
        height: sprite.height,
        xoff: sprite.xoff,
        yoff: sprite.yoff
      },
      egg: null,
      npcPreview: null,
      itemPreview: null,
      shapeDefId: `shape:${shapeCode}`,
      spriteId,
      _rawRecord: record,
      _bundleOffset: bundleOffset,
      _paletteIndex: paletteIndex,
      _isFallback: isFallback
    });

    familyCounts[record.sourceFamily] = (familyCounts[record.sourceFamily] ?? 0) + 1;
    zCounts[String(worldZ)] = (zCounts[String(worldZ)] ?? 0) + 1;
    sourceCounts[isFallback ? `psx-${record.sourceFamily}-fallback` : `psx-${record.sourceFamily}-art`] = (sourceCounts[isFallback ? `psx-${record.sourceFamily}-fallback` : `psx-${record.sourceFamily}-art`] ?? 0) + 1;
  }

  const xShift = -Math.min(0, minScreenLeft);
  const yShift = -Math.min(0, minScreenTop);
  finalRight = 0;
  finalBottom = 0;
  const usedAtlasIds = new Set();
  const usedSpriteIds = new Set();
  const usedShapeDefinitionIds = new Set();
  const mapSourceItems = [];

  for (const item of items) {
    item.screen.left += xShift;
    item.screen.right += xShift;
    item.screen.top += yShift;
    item.screen.bottom += yShift;
    item.screen.anchorX += xShift;
    item.screen.anchorY += yShift;
    finalRight = Math.max(finalRight, item.screen.right);
    finalBottom = Math.max(finalBottom, item.screen.bottom);
    usedShapeDefinitionIds.add(item.shapeDefId);
    usedSpriteIds.add(item.spriteId);
    const sprite = spriteIndex.get(item.spriteId);
    if (sprite?.atlasId) {
      usedAtlasIds.add(sprite.atlasId);
    }

    mapSourceItems.push({
      x: item.world.x,
      y: item.world.y,
      z: item.world.z,
      shape: Number.parseInt(item.shapeDefId.slice("shape:".length), 10),
      frame: item.frame,
      flags: item.flags.raw,
      quality: item.quality,
      npcNum: item.npcNum,
      mapNum: item.mapNum,
      nextItem: 0,
      source: item.source,
      sourceFamily: item._rawRecord.sourceFamily,
      sourceRole: item._rawRecord.sourceRole,
      sourceRegionName: item._rawRecord.sourceRegionName,
      rawWords: [item._rawRecord.u0, item._rawRecord.u1, item._rawRecord.u2, item._rawRecord.u3, item._rawRecord.u4, item._rawRecord.u5],
      recordSide: item._rawRecord.side,
      rowIndex: item._rawRecord.rowIndex,
      typeId: item._rawRecord.u0,
      lane: item._rawRecord.u5,
      variant: item._rawRecord.u4,
      stateSelector: item._rawRecord.u4,
      bundleOffset: item._bundleOffset,
      paletteIndex: item._paletteIndex,
      projectedAnchorX: item.screen.anchorX,
      projectedAnchorY: item.screen.anchorY,
      isFallback: item._isFallback
    });

    delete item._rawRecord;
    delete item._bundleOffset;
    delete item._paletteIndex;
    delete item._isFallback;
  }

  return {
    build: {
      version: PSX_SCENE_VERSION,
      cacheMode: "single-scene",
      fingerprint,
      generatedAt: new Date().toISOString()
    },
    metadata: {
      game: PSX_GAME_ID,
      gameLabel: PSX_LABEL,
      map: mapEntry.id,
      rawItemCount: records.length,
      itemCount: items.length,
      paintedItemCount: items.length,
      occludedItemCount: 0,
      invalidItemCount: 0,
      invalidItems: [],
      sceneSummary: {
        atlasCount: usedAtlasIds.size,
        spriteCount: usedSpriteIds.size,
        helperCount: 0,
        kindCounts: { terrain: items.length },
        sourceCounts,
        topFamilies: [{ family: null, count: items.length }]
      },
      recordFamilies: mapEntry.recordFamilies.map((family) => ({
        sourceFamily: family.sourceFamily,
        legacySourceFamily: family.legacySourceFamily,
        role: family.role,
        description: family.description,
        regionName: family.regionName,
        regionOffset: family.regionOffset,
        regionSize: family.regionSize,
        recordCount: family.recordCount
      })),
      decodedRuntimeLayers,
      stateLayers: mapEntry.runtimeState?.stateLayers ?? [],
      usage: {
        status: "research",
        confidence: "low",
        knownHints: [
          "Packed PSX reference art now uses shared atlases instead of one atlas per resolved bundle.",
          "Type-to-art resolution now prefers parsed per-type template-bank bundle references before falling back to the old scan-order bundle heuristic.",
          `Scene items preserve executable-named section-0 record families and raw u0..u5 words in mapSource.rawWords.`,
          "Structured section-0 constructor placements now use the constructor-backed +0x06 byte as provisional z.",
          "Palette selection still uses bundle default palettes or local heuristics and remains provisional until the runtime override path is recovered."
        ],
        itemMapNums: [...new Set(records.map((record) => record.u5))].sort((left, right) => left - right),
        nonzeroItemMapNums: [...new Set(records.map((record) => record.u5).filter((value) => value !== 0))].sort((left, right) => left - right),
        npcLinkedItemCount: records.filter((record) => record.u4 !== 0).length,
        note: `PSX art/state probe from ${relativePath}. The export now carries executable-named section-0 record families (${mapEntry.recordFamilies.map((family) => `${family.sourceFamily}:${family.recordCount}`).join(", ")}), parsed runtime-bank layers, and an offline decode of the candidate compressed level-state source. Type-to-art matching is improved but still not fully closed.`,
        hasRenderableContent: true,
        game: PSX_GAME_ID,
        map: mapEntry.id
      },
      baseItemSummary: {
        roofItems: 0,
        editorItems: 0,
        eggFamilyItems: 0,
        invisibleFlaggedItems: 0,
        npcLinkedItems: records.filter((record) => record.u4 !== 0).length
      },
      sorter: `psx_${mapEntry.recordFamilies.map((family) => family.sourceFamily).join("_")}_art_probe`,
      isEmpty: false,
      emptyReason: null,
      bounds: {
        screenLeft: 0,
        screenTop: 0,
        screenRight: finalRight,
        screenBottom: finalBottom,
        width: finalRight,
        height: finalBottom
      },
      zoom: { min: 0.01, max: 8, step: 0.1, initial: 1 },
      buildFingerprint: fingerprint,
      generatedAt: new Date().toISOString(),
      probeStats: {
        sourceFamilies: mapEntry.recordFamilies.map((family) => family.sourceFamily),
        familyCounts,
        zCounts,
        region00RecordCount: mapEntry.region00RecordCount,
        region01RecordCount: mapEntry.region01RecordCount,
        typeCount: [...new Set(records.map((record) => record.u0))].length,
        bundleMappedItemCount: resolvedBundleCount,
        fallbackItemCount,
        fallbackFrameCount,
        laneCounts,
        uniqueZCount: Object.keys(zCounts).length,
        zRange: [Math.min(...records.map((record) => getPsxRecordElevation(record))), Math.max(...records.map((record) => getPsxRecordElevation(record)))],
        u1Range: [Math.min(...records.map((record) => record.u1)), Math.max(...records.map((record) => record.u1))],
        u2Range: [Math.min(...records.map((record) => record.u2)), Math.max(...records.map((record) => record.u2))]
      }
    },
    references: {
      referenceId: PSX_REFERENCE_ID,
      atlasIds: [...usedAtlasIds],
      spriteIds: [...usedSpriteIds],
      shapeDefinitionIds: [...usedShapeDefinitionIds]
    },
    items,
    mapSource: {
      formatVersion: PSX_SCENE_VERSION,
      game: PSX_GAME_ID,
      mapId: mapEntry.id,
      itemRecordSize: 12,
      itemCount: mapSourceItems.length,
      originalByteLength: mapSourceItems.length * 12,
      exportFileName: null,
      defaultTeleportEggShape: null,
      defaultTeleportEggShapeHex: null,
      defaultTeleportEggFrame: null,
      defaultTeleporterEggFrame: null,
      defaultTeleportDestinationEggFrame: null,
      binaryExportSupported: false,
      recordFamilies: mapEntry.recordFamilies.map((family) => ({
        sourceFamily: family.sourceFamily,
        legacySourceFamily: family.legacySourceFamily,
        role: family.role,
        description: family.description,
        regionName: family.regionName,
        regionOffset: family.regionOffset,
        regionSize: family.regionSize,
        recordCount: family.recordCount
      })),
      decodedRuntimeLayers,
      stateLayers: mapEntry.runtimeState?.stateLayers ?? [],
      items: mapSourceItems
    }
  };
}

function collectPsxMapSources(staticDir) {
  const entries = [];
  for (const topLevel of fs.readdirSync(staticDir, { withFileTypes: true })) {
    if (!topLevel.isDirectory() || !/^LSET\d+$/iu.test(topLevel.name)) {
      continue;
    }
    const dirPath = path.join(staticDir, topLevel.name);
    for (const child of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!child.isFile() || !/^L\d+\.WDL$/iu.test(child.name)) {
        continue;
      }
      const relativePath = `${topLevel.name}/${child.name}`;
      const mapId = getMapIdFromRelativePath(relativePath);
      if (!Number.isInteger(mapId)) {
        continue;
      }
      entries.push({
        mapId,
        relativePath,
        absolutePath: path.join(dirPath, child.name)
      });
    }
  }
  return entries.sort((left, right) => left.mapId - right.mapId || left.relativePath.localeCompare(right.relativePath));
}

function buildPsxCatalogPayload(mapEntries, fingerprint, referenceFingerprint) {
  return {
    version: PSX_SCENE_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint,
    referenceId: PSX_REFERENCE_ID,
    referenceFingerprint,
    games: [
      {
        id: PSX_GAME_ID,
        gameId: PSX_GAME_ID,
        referenceId: PSX_REFERENCE_ID,
        versionId: "psx",
        versionLabel: "PSX",
        label: PSX_LABEL,
        selectorLabel: PSX_LABEL,
        mapCount: mapEntries.length,
        maps: mapEntries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          rawItemCount: entry.rawItemCount,
          fingerprint: entry.fingerprint,
          sceneFile: entry.sceneFile
        }))
      }
    ]
  };
}

function resolveSpriteBundlesForMap(data, parsed) {
  const graphicsRegion = parsed.regions.find((region) => region.name === "post_audio_region_04");
  if (!graphicsRegion) {
    return [];
  }

  const palettes16 = extractPaletteSets(data, parsed.headerWords);
  const palettes256 = extractPaletteBlocks256(data, parsed.headerWords);
  const regionData = data.subarray(graphicsRegion.offset, graphicsRegion.offset + graphicsRegion.size);
  return scanSpriteBundles(regionData, 160)
    .map((bundle) => {
      let resolvedPaletteIndex = bundle.paletteIndex;
      let palette = null;
      if (bundle.mode === 2) {
        if (!Number.isInteger(resolvedPaletteIndex) || resolvedPaletteIndex >= palettes16.length) {
          resolvedPaletteIndex = choosePalette(palettes16, bundle.frames, bundle.mode);
        }
        if (Number.isInteger(resolvedPaletteIndex) && resolvedPaletteIndex >= 0 && resolvedPaletteIndex < palettes16.length) {
          palette = palettes16[resolvedPaletteIndex];
        }
      } else if (bundle.mode === 1) {
        if (!palettes256.length) {
          return null;
        }
        if (!Number.isInteger(resolvedPaletteIndex) || resolvedPaletteIndex >= palettes256.length) {
          resolvedPaletteIndex = 0;
        }
        palette = palettes256[resolvedPaletteIndex];
      }
      if (!palette) {
        return null;
      }
      return {
        ...bundle,
        offset: graphicsRegion.offset + bundle.offset,
        resolvedPaletteIndex,
        palette
      };
    })
    .filter(Boolean);
}

export function isPsxPrebuiltGame(gameConfigOrId) {
  if (!gameConfigOrId) {
    return false;
  }
  return (typeof gameConfigOrId === "string" ? gameConfigOrId : gameConfigOrId.id) === PSX_GAME_ID;
}

export function getPsxProcessedCatalogPath() {
  return PSX_PROCESSED_CATALOG_FILE;
}

export function loadPsxProcessedCatalog() {
  if (!fs.existsSync(PSX_PROCESSED_CATALOG_FILE) || !fs.existsSync(PSX_REFERENCE_DATA_FILE)) {
    return null;
  }
  const payload = JSON.parse(fs.readFileSync(PSX_PROCESSED_CATALOG_FILE, "utf8"));
  const game = payload?.games?.find((entry) => entry.id === PSX_GAME_ID);
  if (!game?.maps?.length) {
    return null;
  }
  for (const map of game.maps) {
    if (!map?.sceneFile || !fs.existsSync(map.sceneFile)) {
      return null;
    }
  }
  return payload;
}

export function getPsxProcessedMap(gameId, mapId) {
  if (gameId !== PSX_GAME_ID) {
    return null;
  }
  const payload = loadPsxProcessedCatalog();
  const game = payload?.games?.find((entry) => entry.id === gameId);
  const map = game?.maps?.find((entry) => entry.id === mapId) ?? null;
  if (!map?.sceneFile || !fs.existsSync(map.sceneFile)) {
    return null;
  }
  return {
    catalog: payload,
    game,
    map
  };
}

export function buildPsxTypeProbeCache(gameConfig, options = {}) {
  const staticDir = gameConfig.staticDir;
  if (!fs.existsSync(staticDir)) {
    throw new Error(`PSX static directory not found: ${staticDir}`);
  }

  const requestedMapId = Number.isInteger(options.mapId) ? options.mapId : null;
  const sources = collectPsxMapSources(staticDir);
  const filteredSources = requestedMapId === null ? sources : sources.filter((entry) => entry.mapId === requestedMapId);
  if (!filteredSources.length) {
    throw new Error(requestedMapId === null ? "No PSX WDL maps found under STATIC_PSX" : `No PSX WDL map ${requestedMapId} found under STATIC_PSX`);
  }

  fs.rmSync(path.join(SCENE_CACHE_ROOT, PSX_GAME_ID), { recursive: true, force: true });
  fs.rmSync(PSX_REFERENCE_CACHE_ROOT, { recursive: true, force: true });
  fs.rmSync(PSX_CACHE_ROOT, { recursive: true, force: true });
  ensureDir(path.dirname(PSX_CATALOG_FILE));
  ensureDir(PSX_CACHE_ROOT);

  const mapEntries = [];
  const sourceDigests = [];
  for (const source of filteredSources) {
    const data = fs.readFileSync(source.absolutePath);
    const parsed = parseLsetWdl(data);
    if (!parsed) {
      continue;
    }
    const recordFamilies = collectPsxRecordFamilies(data);
    if (!recordFamilies.length) {
      continue;
    }

    const records = recordFamilies.flatMap((family) => family.records);
    if (!records.length) {
      continue;
    }

    const region00RecordCount = recordFamilies.find((family) => family.legacySourceFamily === "region00" || family.sourceFamily === PSX_FAMILY_SECTION0_ROOT)?.recordCount ?? 0;
    const region01RecordCount = recordFamilies.find((family) => family.legacySourceFamily === "region01" || family.sourceFamily === PSX_FAMILY_SECTION0_BULK)?.recordCount ?? 0;
    const runtimeState = collectPsxRuntimeState(data, parsed, records);

    sourceDigests.push(`${source.relativePath}:${fileStamp(source.absolutePath)}`);
    mapEntries.push({
      id: source.mapId,
      label: `PSX Map ${source.mapId} (${source.relativePath.replace(/\.WDL$/iu, "")})`,
      relativePath: source.relativePath,
      rawItemCount: records.length,
      sourceFamily: recordFamilies.map((family) => family.sourceFamily).join("+"),
      recordFamilies,
      region00RecordCount,
      region01RecordCount,
      records,
      spriteBundles: runtimeState.spriteBundles,
      runtimeState
    });
  }

  if (!mapEntries.length) {
    throw new Error("No structured PSX runtime record families were recovered from STATIC_PSX LSET maps");
  }

  const referenceData = buildRealArtReference(mapEntries);
  const catalogFingerprint = sha1(JSON.stringify({ version: PSX_SCENE_VERSION, files: sourceDigests.sort() })).slice(0, 16);
  const manifestMaps = [];
  for (const mapEntry of mapEntries) {
    const mapFingerprint = sha1(JSON.stringify({
      version: PSX_SCENE_VERSION,
      mapId: mapEntry.id,
      relativePath: mapEntry.relativePath,
      recordCount: mapEntry.records.length,
      records: mapEntry.records.map((record) => [record.u0, record.u1, record.u2, record.u3, record.u4, record.u5]),
      bundleCount: mapEntry.spriteBundles.length
    })).slice(0, 16);
    const scene = buildSceneForMap(mapEntry, referenceData, mapFingerprint, mapEntry.relativePath);
    const cacheDir = path.join(SCENE_CACHE_ROOT, PSX_GAME_ID, `map-${mapEntry.id}`, mapFingerprint);
    ensureDir(cacheDir);
    const sceneFile = path.join(cacheDir, "scene.json");
    fs.writeFileSync(sceneFile, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
    manifestMaps.push({
      id: mapEntry.id,
      label: mapEntry.label,
      rawItemCount: mapEntry.rawItemCount,
      fingerprint: mapFingerprint,
      sceneFile
    });
  }

  const payload = buildPsxCatalogPayload(manifestMaps, catalogFingerprint, referenceData.fingerprint);
  fs.writeFileSync(PSX_PROCESSED_CATALOG_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    catalogFile: PSX_PROCESSED_CATALOG_FILE,
    referenceDataFile: PSX_REFERENCE_DATA_FILE,
    gameId: PSX_GAME_ID,
    mapCount: manifestMaps.length,
    atlasCount: referenceData.atlases.length,
    shapeDefinitionCount: referenceData.shapeDefinitions.length,
    maps: manifestMaps
  };
}