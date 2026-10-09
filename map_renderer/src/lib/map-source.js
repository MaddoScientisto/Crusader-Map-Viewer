import fs from "node:fs";

import { readU16LE, readU32LE } from "./binary.js";
import {
  decodeFixedItemRecord,
  encodeFixedItemRecord,
  encodeFixedMapRecords,
  FIXED_RECORD_SIZE as SHARED_FIXED_RECORD_SIZE,
  rebuildFixedArchiveBuffer
} from "../shared/flx-archive-codec.js";
import {
  FIXED_MAP_COUNT_OFFSET,
  FIXED_MAP_TABLE_OFFSET
} from "./formats.js";

export const FIXED_RECORD_SIZE = SHARED_FIXED_RECORD_SIZE;
export const MAP_SOURCE_FORMAT_VERSION = "crusader-fixed-map-v1";
export { decodeFixedItemRecord, encodeFixedItemRecord, rebuildFixedArchiveBuffer };

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

export function parseMapItemsBuffer(payload, source = "fixed") {
  const items = [];
  for (let base = 0; base + FIXED_RECORD_SIZE <= payload.length; base += FIXED_RECORD_SIZE) {
    items.push(decodeFixedItemRecord(payload.subarray(base, base + FIXED_RECORD_SIZE), source));
  }
  return items;
}

export function encodeMapItems(items) {
  return encodeFixedMapRecords(items);
}

export function readFixedArchive(filePath) {
  return fs.readFileSync(filePath);
}

export function getFixedArchiveEntries(data) {
  const mapCount = readU16LE(data, FIXED_MAP_COUNT_OFFSET);
  const entries = [];
  for (let mapId = 0; mapId < mapCount; mapId += 1) {
    const tableOffset = FIXED_MAP_TABLE_OFFSET + mapId * 8;
    entries.push({
      mapId,
      tableOffset,
      offset: readU32LE(data, tableOffset),
      size: readU32LE(data, tableOffset + 4)
    });
  }
  return entries;
}

export function getFixedMapEntry(data, mapIndex) {
  const entries = getFixedArchiveEntries(data);
  const entry = entries[mapIndex];
  if (!entry) {
    throw new Error(`map index ${mapIndex} out of range 0..${entries.length - 1}`);
  }
  return entry;
}

export function extractMapPayload(data, mapIndex) {
  const entry = getFixedMapEntry(data, mapIndex);
  const payload = data.subarray(entry.offset, entry.offset + entry.size);
  if (payload.length !== entry.size) {
    throw new Error(`map ${mapIndex} payload truncated`);
  }
  return payload;
}

export function loadMapPayload(filePath, mapIndex) {
  return extractMapPayload(readFixedArchive(filePath), mapIndex);
}

export function detectDefaultTeleportEggShape(shapeInfos) {
  for (let shape = 0; shape < shapeInfos.length; shape += 1) {
    if (shapeInfos[shape]?.family === 8) {
      return shape;
    }
  }
  return null;
}

export function buildMapSource(gameId, mapId, items, teleportEggTemplate, originalByteLength) {
  return {
    formatVersion: MAP_SOURCE_FORMAT_VERSION,
    game: gameId,
    mapId,
    itemRecordSize: FIXED_RECORD_SIZE,
    itemCount: items.length,
    originalByteLength,
    exportFileName: `${gameId}-map-${mapId}.bin`,
    defaultTeleportEggShape: teleportEggTemplate?.shape ?? null,
    defaultTeleportEggShapeHex: Number.isInteger(teleportEggTemplate?.shape) ? toHex(teleportEggTemplate.shape) : null,
    defaultTeleportEggFrame: teleportEggTemplate?.teleporterFrame ?? teleportEggTemplate?.frame ?? null,
    defaultTeleporterEggFrame: teleportEggTemplate?.teleporterFrame ?? teleportEggTemplate?.frame ?? null,
    defaultTeleportDestinationEggFrame: teleportEggTemplate?.destinationFrame ?? teleportEggTemplate?.frame ?? null,
    items: items.map((item) => ({
      x: item.x,
      y: item.y,
      z: item.z,
      shape: item.shape,
      frame: item.frame,
      flags: item.flags,
      quality: item.quality,
      npcNum: item.npcNum,
      mapNum: item.mapNum,
      nextItem: item.nextItem,
      source: item.source ?? "fixed"
    }))
  };
}
