const FLEX_TABLE_OFFSET = 0x80;
const FLEX_COUNT_OFFSET = 0x54;
const FIXED_TABLE_OFFSET = 0x80;
const FIXED_COUNT_OFFSET = 0x54;
export const FIXED_RECORD_SIZE = 16;

function toBytes(input, label) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError(`${label} must be an ArrayBuffer or byte array`);
}

function makeView(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function readArchiveTable(input, kind) {
  const data = toBytes(input, `${kind} archive`);
  const view = makeView(data);
  const countOffset = kind === "FLEX" ? FLEX_COUNT_OFFSET : FIXED_COUNT_OFFSET;
  const tableOffset = kind === "FLEX" ? FLEX_TABLE_OFFSET : FIXED_TABLE_OFFSET;
  const countSize = kind === "FLEX" ? 4 : 2;
  if (data.byteLength < countOffset + countSize) {
    throw new Error(`${kind} archive header is truncated`);
  }

  const count = kind === "FLEX" ? view.getUint32(countOffset, true) : view.getUint16(countOffset, true);
  const tableEnd = tableOffset + count * 8;
  if (!Number.isSafeInteger(tableEnd) || tableEnd > data.byteLength) {
    throw new Error(`${kind} archive table is truncated (declares ${count} entries)`);
  }

  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = tableOffset + index * 8;
    const offset = view.getUint32(entryOffset, true);
    const size = view.getUint32(entryOffset + 4, true);
    const end = offset + size;
    if (!Number.isSafeInteger(end) || end > data.byteLength || (size > 0 && offset < tableEnd)) {
      throw new Error(`${kind} entry ${index} points outside the archive`);
    }
    if (kind === "FIXED" && size % FIXED_RECORD_SIZE !== 0) {
      throw new Error(`FIXED map ${index} payload size ${size} is not a multiple of ${FIXED_RECORD_SIZE}`);
    }
    entries.push({
      index,
      offset,
      size,
      bytes: data.subarray(offset, end)
    });
  }

  return { kind, data, entries, tableOffset, tableEnd, countOffset };
}

export function parseFlexArchive(input) {
  return readArchiveTable(input, "FLEX");
}

export function parseFixedArchive(input) {
  return readArchiveTable(input, "FIXED");
}

function validateFixedMapItem(item, index = -1) {
  const label = index >= 0 ? `map item ${index}` : "map item";
  if (!Number.isInteger(item.x) || item.x < 0 || item.x > 0x1fffe || item.x % 2 !== 0) {
    throw new Error(`${label} has invalid x coordinate ${item.x}`);
  }
  if (!Number.isInteger(item.y) || item.y < 0 || item.y > 0x1fffe || item.y % 2 !== 0) {
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

export function decodeFixedItemRecord(input, source = "fixed") {
  const record = toBytes(input, "FIXED map record");
  if (record.byteLength < FIXED_RECORD_SIZE) {
    throw new Error(`FIXED record too small: ${record.byteLength}`);
  }
  const view = makeView(record);
  return {
    x: view.getUint16(0, true) * 2,
    y: view.getUint16(2, true) * 2,
    z: record[4],
    shape: view.getUint16(5, true),
    frame: record[7],
    flags: view.getUint16(8, true),
    quality: view.getUint16(10, true),
    npcNum: record[12],
    mapNum: record[13],
    nextItem: view.getUint16(14, true),
    source
  };
}

export function encodeFixedItemRecord(item) {
  validateFixedMapItem(item);
  const record = new Uint8Array(FIXED_RECORD_SIZE);
  const view = makeView(record);
  view.setUint16(0, item.x / 2, true);
  view.setUint16(2, item.y / 2, true);
  record[4] = item.z;
  view.setUint16(5, item.shape, true);
  record[7] = item.frame;
  view.setUint16(8, item.flags, true);
  view.setUint16(10, item.quality, true);
  record[12] = item.npcNum;
  record[13] = item.mapNum;
  view.setUint16(14, item.nextItem, true);
  return record;
}

export function parseFixedMapRecords(input, source = "fixed") {
  const payload = toBytes(input, "FIXED map payload");
  if (payload.byteLength % FIXED_RECORD_SIZE !== 0) {
    throw new Error(`FIXED map payload size ${payload.byteLength} is not a multiple of ${FIXED_RECORD_SIZE}`);
  }
  return Array.from({ length: payload.byteLength / FIXED_RECORD_SIZE }, (_, index) => {
    const offset = index * FIXED_RECORD_SIZE;
    return decodeFixedItemRecord(payload.subarray(offset, offset + FIXED_RECORD_SIZE), source);
  });
}

export function encodeFixedMapRecords(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("FIXED map records must be an array");
  }
  const records = items.map((item, index) => {
    validateFixedMapItem(item, index);
    return encodeFixedItemRecord(item);
  });
  const result = new Uint8Array(records.length * FIXED_RECORD_SIZE);
  records.forEach((record, index) => result.set(record, index * FIXED_RECORD_SIZE));
  return result;
}

export function parseGlobEntry(input, index = -1) {
  const bytes = toBytes(input, "GLOB entry");
  if (bytes.byteLength === 0) {
    return [];
  }
  if (bytes.byteLength < 2) {
    throw new Error(`GLOB entry ${index} is missing its child count`);
  }
  const view = makeView(bytes);
  const count = view.getUint16(0, true);
  const requiredSize = 2 + count * 6;
  if (requiredSize > bytes.byteLength) {
    throw new Error(`GLOB entry ${index} is truncated (declares ${count} children)`);
  }
  return Array.from({ length: count }, (_, childIndex) => {
    const offset = 2 + childIndex * 6;
    return {
      x: bytes[offset],
      y: bytes[offset + 1],
      z: bytes[offset + 2],
      shape: view.getUint16(offset + 3, true),
      frame: bytes[offset + 5]
    };
  });
}

export function encodeGlobEntry(children) {
  if (!Array.isArray(children) || children.length > 0xffff) {
    throw new Error("GLOB entry must contain at most 65535 child descriptors");
  }
  const bytes = new Uint8Array(2 + children.length * 6);
  const view = makeView(bytes);
  view.setUint16(0, children.length, true);
  children.forEach((child, index) => {
    for (const field of ["x", "y", "z", "frame"]) {
      if (!Number.isInteger(child[field]) || child[field] < 0 || child[field] > 0xff) {
        throw new Error(`GLOB child ${index} has invalid ${field} value ${child[field]}`);
      }
    }
    if (!Number.isInteger(child.shape) || child.shape < 0 || child.shape > 0xffff) {
      throw new Error(`GLOB child ${index} has invalid shape value ${child.shape}`);
    }
    const offset = 2 + index * 6;
    bytes[offset] = child.x;
    bytes[offset + 1] = child.y;
    bytes[offset + 2] = child.z;
    view.setUint16(offset + 3, child.shape, true);
    bytes[offset + 5] = child.frame;
  });
  return bytes;
}

function concatenate(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function rebuildArchive(archive, payloads) {
  const entries = archive.entries;
  const payloadByIndex = entries.map((entry) => {
    const replacement = payloads.get(entry.index);
    return replacement === undefined ? entry.bytes : toBytes(replacement, `archive entry ${entry.index}`);
  });
  const appendedEntries = payloads.appended ?? [];
  for (const payload of appendedEntries) {
    payloadByIndex.push(toBytes(payload, "new archive entry"));
  }

  const originalPayloadStart = entries.reduce(
    (first, entry) => entry.size > 0 ? Math.min(first, entry.offset) : first,
    archive.data.byteLength
  );
  const originalPayloadEnd = entries.reduce(
    (last, entry) => entry.size > 0 ? Math.max(last, entry.offset + entry.size) : last,
    originalPayloadStart
  );
  const prefixLength = Math.max(originalPayloadStart, archive.tableOffset + payloadByIndex.length * 8);
  const prefix = new Uint8Array(prefixLength);
  prefix.set(archive.data.subarray(0, Math.min(originalPayloadStart, prefixLength)));
  const suffix = archive.data.slice(originalPayloadEnd);
  const view = makeView(prefix);
  if (archive.kind === "FLEX") {
    view.setUint32(archive.countOffset, payloadByIndex.length, true);
  } else {
    if (payloadByIndex.length > 0xffff) {
      throw new Error("FIXED archive cannot contain more than 65535 map slots");
    }
    view.setUint16(archive.countOffset, payloadByIndex.length, true);
  }

  let nextOffset = prefixLength;
  const payloadBuffers = [];
  for (let index = 0; index < payloadByIndex.length; index += 1) {
    const tableEntryOffset = archive.tableOffset + index * 8;
    const bytes = payloadByIndex[index];
    const offset = nextOffset;
    view.setUint32(tableEntryOffset, offset, true);
    view.setUint32(tableEntryOffset + 4, bytes.byteLength, true);
    if (bytes.byteLength > 0) {
      payloadBuffers.push(bytes);
      nextOffset += bytes.byteLength;
    }
  }
  return concatenate([prefix, ...payloadBuffers, suffix]);
}

export function rebuildFlexArchiveBuffer(sourceData, entryPayloads, appendedEntries = []) {
  const archive = parseFlexArchive(sourceData);
  const payloads = new Map(entryPayloads);
  payloads.appended = appendedEntries;
  return rebuildArchive(archive, payloads);
}

export function rebuildFixedArchiveBuffer(sourceData, mapPayloadById) {
  const archive = parseFixedArchive(sourceData);
  for (const [mapId, payload] of mapPayloadById) {
    if (!Number.isInteger(mapId) || mapId < 0 || mapId >= archive.entries.length) {
      throw new Error(`FIXED map index ${mapId} is out of range`);
    }
    if (toBytes(payload, `FIXED map ${mapId} payload`).byteLength % FIXED_RECORD_SIZE !== 0) {
      throw new Error(`FIXED map ${mapId} payload size is not a multiple of ${FIXED_RECORD_SIZE}`);
    }
  }
  return rebuildArchive(archive, new Map(mapPayloadById));
}

export function parseGlobArchive(input) {
  const archive = parseFlexArchive(input);
  const entries = archive.entries.map((entry) => ({
    ...entry,
    children: parseGlobEntry(entry.bytes, entry.index)
  }));
  return { ...archive, entries };
}