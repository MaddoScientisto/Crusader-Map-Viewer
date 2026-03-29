import fs from "node:fs";

const FLEX_HEADER_SIZE = 0x52;
const FLEX_COUNT_OFFSET = FLEX_HEADER_SIZE + 2;
const FLEX_TABLE_OFFSET = 0x80;
const NPC_ROW_SIZE = 142;
const NPC_NAME_SIZE = 32;
const NPC_NAME_OBJECT_INDEX = 2;
const NPC_RECORD_OBJECT_INDEX = 0;
const NPC_SHAPE_OFFSET = 0x3e;

function readU16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readU32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

export function loadFlexEntries(filePath) {
  const data = fs.readFileSync(filePath);
  const count = readU32LE(data, FLEX_COUNT_OFFSET);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = FLEX_TABLE_OFFSET + index * 8;
    entries.push({
      offset: readU32LE(data, offset),
      size: readU32LE(data, offset + 4)
    });
  }
  return { data, entries };
}

function readNullTerminatedAscii(buffer) {
  const nulIndex = buffer.indexOf(0);
  const end = nulIndex >= 0 ? nulIndex : buffer.length;
  return buffer.toString("ascii", 0, end).trim();
}

export function extractNpcSpawnerRows(filePath) {
  const { data, entries } = loadFlexEntries(filePath);
  const records = entries[NPC_RECORD_OBJECT_INDEX];
  const names = entries[NPC_NAME_OBJECT_INDEX];
  if (!records || !names) {
    throw new Error(`DTABLE is missing NPC record or name objects: ${filePath}`);
  }

  const rowCount = Math.floor(records.size / NPC_ROW_SIZE);
  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    const recordOffset = records.offset + index * NPC_ROW_SIZE;
    const nameOffset = names.offset + index * NPC_NAME_SIZE;
    const name = readNullTerminatedAscii(data.subarray(nameOffset, nameOffset + NPC_NAME_SIZE));
    const shape = readU16LE(data, recordOffset + NPC_SHAPE_OFFSET);
    if (!name && shape === 0) {
      continue;
    }
    rows.push({ index, name, shape });
  }
  return rows;
}

export function buildNpcSpawnerData(gameRowsById) {
  return Object.fromEntries(
    Object.entries(gameRowsById).map(([gameId, rows]) => [
      gameId,
      Object.fromEntries(rows.map((row) => [String(row.index), { name: row.name, shape: row.shape }]))
    ])
  );
}