export const COMPACT_SCENE_ITEMS_FORMAT = "crusader-scene-items-b1";
export const COMPACT_SCENE_ITEM_RECORD_SIZE = 19;
export const COMPACT_MAP_SOURCE_ITEMS_FORMAT = "crusader-map-source-items-b1";
export const COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE = 16;

const NULL_U16 = 0xffff;

function writeU16LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function encodeBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeCoord(value, label) {
  if (!Number.isInteger(value) || (value & 1) !== 0 || value < 0 || value > 0x1fffe) {
    throw new Error(`Cannot compact-encode ${label} coordinate ${value}`);
  }
  return value >> 1;
}

function decodeCoord(value) {
  return value << 1;
}

function parseShapeValue(item) {
  if (Number.isInteger(item?.shape)) {
    return item.shape;
  }
  if (typeof item?.shapeDefId === "string" && item.shapeDefId.startsWith("shape:")) {
    return Number.parseInt(item.shapeDefId.slice("shape:".length), 10);
  }
  if (typeof item?.spriteId === "string" && item.spriteId.startsWith("sprite:")) {
    const [shape] = item.spriteId.slice("sprite:".length).split(":");
    return Number.parseInt(shape, 10);
  }
  return Number.NaN;
}

export function packCompactSceneItems(items = []) {
  const sourceTable = [...new Set(items.map((item) => item.source ?? "fixed"))];
  const bytes = new Uint8Array(items.length * COMPACT_SCENE_ITEM_RECORD_SIZE);

  items.forEach((item, index) => {
    const offset = index * COMPACT_SCENE_ITEM_RECORD_SIZE;
    const sourceIndex = sourceTable.indexOf(item.source ?? "fixed");
    const shape = parseShapeValue(item);
    const worldX = item?.world?.x ?? item?.x;
    const worldY = item?.world?.y ?? item?.y;
    const worldZ = item?.world?.z ?? item?.z;
    const rawFlags = item?.flags?.raw ?? item?.flags;
    if (sourceIndex < 0 || sourceIndex > 0xff) {
      throw new Error(`Cannot compact-encode scene item source ${item.source}`);
    }
    if (!Number.isInteger(shape) || shape < 0 || shape > 0xffff) {
      throw new Error(`Cannot compact-encode scene item shape ${item?.shapeDefId ?? item?.spriteId ?? item?.shape}`);
    }

    writeU16LE(bytes, offset, encodeCoord(worldX, "x"));
    writeU16LE(bytes, offset + 2, encodeCoord(worldY, "y"));
    bytes[offset + 4] = worldZ & 0xff;
    writeU16LE(bytes, offset + 5, shape & 0xffff);
    bytes[offset + 7] = item.frame & 0xff;
    writeU16LE(bytes, offset + 8, rawFlags & 0xffff);
    writeU16LE(bytes, offset + 10, item.quality & 0xffff);
    bytes[offset + 12] = item.npcNum & 0xff;
    bytes[offset + 13] = item.mapNum & 0xff;
    writeU16LE(bytes, offset + 14, item.nextItem & 0xffff);
    writeU16LE(bytes, offset + 16, Number.isInteger(item.mapSourceIndex) ? (item.mapSourceIndex & 0xffff) : NULL_U16);
    bytes[offset + 18] = sourceIndex & 0xff;
  });

  return {
    format: COMPACT_SCENE_ITEMS_FORMAT,
    recordSize: COMPACT_SCENE_ITEM_RECORD_SIZE,
    itemCount: items.length,
    sources: sourceTable,
    data: encodeBase64(bytes)
  };
}

export function unpackCompactSceneItems(payload) {
  if (!payload?.data) {
    return [];
  }
  if (payload.format !== COMPACT_SCENE_ITEMS_FORMAT) {
    throw new Error(`Unsupported compact scene item format ${payload.format}`);
  }

  const bytes = decodeBase64(payload.data);
  const recordSize = payload.recordSize ?? COMPACT_SCENE_ITEM_RECORD_SIZE;
  const itemCount = payload.itemCount ?? Math.trunc(bytes.length / recordSize);
  if (recordSize !== COMPACT_SCENE_ITEM_RECORD_SIZE || bytes.length !== itemCount * recordSize) {
    throw new Error("Compact scene item payload is truncated or malformed");
  }

  const sourceTable = Array.isArray(payload.sources) && payload.sources.length ? payload.sources : ["fixed"];
  const items = [];
  for (let index = 0; index < itemCount; index += 1) {
    const offset = index * recordSize;
    const sourceIndex = bytes[offset + 18];
    items.push({
      x: decodeCoord(readU16LE(bytes, offset)),
      y: decodeCoord(readU16LE(bytes, offset + 2)),
      z: bytes[offset + 4],
      shape: readU16LE(bytes, offset + 5),
      frame: bytes[offset + 7],
      flags: readU16LE(bytes, offset + 8),
      quality: readU16LE(bytes, offset + 10),
      npcNum: bytes[offset + 12],
      mapNum: bytes[offset + 13],
      nextItem: readU16LE(bytes, offset + 14),
      mapSourceIndex: readU16LE(bytes, offset + 16) === NULL_U16 ? null : readU16LE(bytes, offset + 16),
      source: sourceTable[sourceIndex] ?? sourceTable[0] ?? "fixed"
    });
  }
  return items;
}

export function packCompactMapSourceItems(items = []) {
  const bytes = new Uint8Array(items.length * COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE);

  items.forEach((item, index) => {
    const offset = index * COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE;
    writeU16LE(bytes, offset, encodeCoord(item.x, "x"));
    writeU16LE(bytes, offset + 2, encodeCoord(item.y, "y"));
    bytes[offset + 4] = item.z & 0xff;
    writeU16LE(bytes, offset + 5, item.shape & 0xffff);
    bytes[offset + 7] = item.frame & 0xff;
    writeU16LE(bytes, offset + 8, item.flags & 0xffff);
    writeU16LE(bytes, offset + 10, item.quality & 0xffff);
    bytes[offset + 12] = item.npcNum & 0xff;
    bytes[offset + 13] = item.mapNum & 0xff;
    writeU16LE(bytes, offset + 14, item.nextItem & 0xffff);
  });

  return {
    format: COMPACT_MAP_SOURCE_ITEMS_FORMAT,
    recordSize: COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE,
    itemCount: items.length,
    data: encodeBase64(bytes)
  };
}

export function unpackCompactMapSourceItems(payload) {
  if (!payload?.data) {
    return [];
  }
  if (payload.format !== COMPACT_MAP_SOURCE_ITEMS_FORMAT) {
    throw new Error(`Unsupported compact map source item format ${payload.format}`);
  }

  const bytes = decodeBase64(payload.data);
  const recordSize = payload.recordSize ?? COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE;
  const itemCount = payload.itemCount ?? Math.trunc(bytes.length / recordSize);
  if (recordSize !== COMPACT_MAP_SOURCE_ITEM_RECORD_SIZE || bytes.length !== itemCount * recordSize) {
    throw new Error("Compact map source item payload is truncated or malformed");
  }

  const items = [];
  for (let index = 0; index < itemCount; index += 1) {
    const offset = index * recordSize;
    items.push({
      x: decodeCoord(readU16LE(bytes, offset)),
      y: decodeCoord(readU16LE(bytes, offset + 2)),
      z: bytes[offset + 4],
      shape: readU16LE(bytes, offset + 5),
      frame: bytes[offset + 7],
      flags: readU16LE(bytes, offset + 8),
      quality: readU16LE(bytes, offset + 10),
      npcNum: bytes[offset + 12],
      mapNum: bytes[offset + 13],
      nextItem: readU16LE(bytes, offset + 14),
      source: "fixed"
    });
  }
  return items;
}