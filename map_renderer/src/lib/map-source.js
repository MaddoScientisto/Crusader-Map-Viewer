import fs from "node:fs";

import { readU16LE, readU32LE } from "./binary.js";
import {
  CRUSADER_COORD_SCALE,
  FIXED_MAP_COUNT_OFFSET,
  FIXED_MAP_TABLE_OFFSET
} from "./formats.js";

export const FIXED_RECORD_SIZE = 16;
export const MAP_SOURCE_FORMAT_VERSION = "crusader-fixed-map-v1";

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function validateMapItem(item, index = -1) {
  const label = index >= 0 ? `map item ${index}` : "map item";
  if (!Number.isInteger(item.x) || item.x < 0 || item.x > 0x1fffe || (item.x % CRUSADER_COORD_SCALE) !== 0) {
    throw new Error(`${label} has invalid x coordinate ${item.x}`);
  }
  if (!Number.isInteger(item.y) || item.y < 0 || item.y > 0x1fffe || (item.y % CRUSADER_COORD_SCALE) !== 0) {
    throw new Error(`${label} has invalid y coordinate ${item.y}`);
  }
  if (!Number.isInteger(item.z) || item.z < 0 || item.z > 0xff) {
    throw new Error(`${label} has invalid z coordinate ${item.z}`);
  }
  if (!Number.isInteger(item.shape) || item.shape < 0 || item.shape > 0xffff) {
    throw new Error(`${label} has invalid shape ${item.shape}`);
  }
  if (!Number.isInteger(item.frame) || item.frame < 0 || item.frame > 0xff) {
    throw new Error(`${label} has invalid frame ${item.frame}`);
  }
  if (!Number.isInteger(item.flags) || item.flags < 0 || item.flags > 0xffff) {
    throw new Error(`${label} has invalid flags ${item.flags}`);
  }
  if (!Number.isInteger(item.quality) || item.quality < 0 || item.quality > 0xffff) {
    throw new Error(`${label} has invalid quality ${item.quality}`);
  }
  if (!Number.isInteger(item.npcNum) || item.npcNum < 0 || item.npcNum > 0xff) {
    throw new Error(`${label} has invalid npcNum ${item.npcNum}`);
  }
  if (!Number.isInteger(item.mapNum) || item.mapNum < 0 || item.mapNum > 0xff) {
    throw new Error(`${label} has invalid mapNum ${item.mapNum}`);
  }
  if (!Number.isInteger(item.nextItem) || item.nextItem < 0 || item.nextItem > 0xffff) {
    throw new Error(`${label} has invalid nextItem ${item.nextItem}`);
  }
}

export function decodeFixedItemRecord(record, source = "fixed") {
  if (record.length < FIXED_RECORD_SIZE) {
    throw new Error(`FIXED record too small: ${record.length}`);
  }
  return {
    x: readU16LE(record, 0) * CRUSADER_COORD_SCALE,
    y: readU16LE(record, 2) * CRUSADER_COORD_SCALE,
    z: record[4],
    shape: readU16LE(record, 5),
    frame: record[7],
    flags: readU16LE(record, 8),
    quality: readU16LE(record, 10),
    npcNum: record[12],
    mapNum: record[13],
    nextItem: readU16LE(record, 14),
    source
  };
}

export function encodeFixedItemRecord(item) {
  validateMapItem(item);
  const record = Buffer.alloc(FIXED_RECORD_SIZE);
  record.writeUInt16LE(item.x / CRUSADER_COORD_SCALE, 0);
  record.writeUInt16LE(item.y / CRUSADER_COORD_SCALE, 2);
  record.writeUInt8(item.z, 4);
  record.writeUInt16LE(item.shape, 5);
  record.writeUInt8(item.frame, 7);
  record.writeUInt16LE(item.flags, 8);
  record.writeUInt16LE(item.quality, 10);
  record.writeUInt8(item.npcNum, 12);
  record.writeUInt8(item.mapNum, 13);
  record.writeUInt16LE(item.nextItem, 14);
  return record;
}

export function parseMapItemsBuffer(payload, source = "fixed") {
  const items = [];
  for (let base = 0; base + FIXED_RECORD_SIZE <= payload.length; base += FIXED_RECORD_SIZE) {
    items.push(decodeFixedItemRecord(payload.subarray(base, base + FIXED_RECORD_SIZE), source));
  }
  return items;
}

export function encodeMapItems(items) {
  return Buffer.concat(items.map((item, index) => {
    validateMapItem(item, index);
    return encodeFixedItemRecord(item);
  }));
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

export function rebuildFixedArchiveBuffer(sourceData, mapPayloadById) {
  const entries = getFixedArchiveEntries(sourceData);
  const nonEmptyEntries = entries.filter((entry) => entry.size > 0);
  if (!nonEmptyEntries.length) {
    throw new Error("FIXED archive contains no map table entries");
  }

  const payloadStart = Math.min(...nonEmptyEntries.map((entry) => entry.offset));
  const payloadEnd = Math.max(...nonEmptyEntries.map((entry) => entry.offset + entry.size));
  const header = Buffer.from(sourceData.subarray(0, payloadStart));
  const suffix = Buffer.from(sourceData.subarray(payloadEnd));
  const payloads = [];
  let nextOffset = payloadStart;

  for (const entry of entries) {
    if (entry.size === 0 && !mapPayloadById.has(entry.mapId)) {
      header.writeUInt32LE(entry.offset, entry.tableOffset);
      header.writeUInt32LE(entry.size, entry.tableOffset + 4);
      continue;
    }
    const payload = mapPayloadById.get(entry.mapId) ?? Buffer.from(sourceData.subarray(entry.offset, entry.offset + entry.size));
    header.writeUInt32LE(nextOffset, entry.tableOffset);
    header.writeUInt32LE(payload.length, entry.tableOffset + 4);
    payloads.push(payload);
    nextOffset += payload.length;
  }

  return Buffer.concat([header, ...payloads, suffix]);
}