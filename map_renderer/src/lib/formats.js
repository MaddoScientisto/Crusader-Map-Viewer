import fs from "node:fs";
import path from "node:path";

import { readI32LE, readU16LE, readU24LE, readU32LE } from "./binary.js";
import { loadMapPayload, parseMapItemsBuffer } from "./map-source.js";

export const FLEX_TABLE_OFFSET = 0x80;
export const FLEX_COUNT_OFFSET = 0x54;
export const FIXED_MAP_COUNT_OFFSET = 0x54;
export const FIXED_MAP_TABLE_OFFSET = 0x80;
export const CRUSADER_COORD_SCALE = 2;
export const GLOB_COORD_MASK = ~0x3ff;
export const GLOB_COORD_SHIFT = 2;
export const GLOB_COORD_OFFSET = 2;
export const FLAG_INVISIBLE = 0x0010;
export const FLAG_FLIPPED = 0x0020;
export const EGG_FAMILIES = new Set([3, 4, 7, 8]);

export const SI_FIXED = 0x0001;
export const SI_SOLID = 0x0002;
export const SI_LAND = 0x0008;
export const SI_OCCL = 0x0010;
export const SI_NOISY = 0x0080;
export const SI_DRAW = 0x0100;
export const SI_ROOF = 0x0400;
export const SI_TRANSL = 0x0800;

export function getMapCount(fixedDatPath) {
  const data = fs.readFileSync(fixedDatPath);
  return readU16LE(data, FIXED_MAP_COUNT_OFFSET);
}

export function getMapSummaries(fixedDatPath) {
  const data = fs.readFileSync(fixedDatPath);
  const mapCount = readU16LE(data, FIXED_MAP_COUNT_OFFSET);
  const maps = [];
  for (let mapId = 0; mapId < mapCount; mapId += 1) {
    const tableOffset = FIXED_MAP_TABLE_OFFSET + mapId * 8;
    const mapOffset = readU32LE(data, tableOffset);
    const mapSize = readU32LE(data, tableOffset + 4);
    maps.push({
      id: mapId,
      offset: mapOffset,
      byteSize: mapSize,
      rawItemCount: Math.floor(mapSize / 16),
      isValid: mapSize >= 16
    });
  }
  return maps;
}

export class FlexArchive {
  constructor(filePath) {
    this.path = filePath;
    this.data = fs.readFileSync(filePath);
    this.entries = FlexArchive.readEntries(this.data);
  }

  static readEntries(data) {
    const count = readU32LE(data, FLEX_COUNT_OFFSET);
    const entries = [];
    for (let index = 0; index < count; index += 1) {
      const base = FLEX_TABLE_OFFSET + index * 8;
      entries.push({
        offset: readU32LE(data, base),
        size: readU32LE(data, base + 4)
      });
    }
    return entries;
  }

  get(index) {
    const entry = this.entries[index];
    if (!entry || entry.size === 0) {
      return Buffer.alloc(0);
    }
    return this.data.subarray(entry.offset, entry.offset + entry.size);
  }

  get length() {
    return this.entries.length;
  }
}

export class ShapeArchive {
  constructor(filePath) {
    this.archive = new FlexArchive(filePath);
    this.shapeCache = new Map();
    this.decodedFrameCache = new Map();
  }

  getFrame(shapeIndex, frameIndex) {
    const frames = this.getShape(shapeIndex);
    if (frameIndex < 0 || frameIndex >= frames.length) {
      throw new RangeError(`shape ${shapeIndex} frame ${frameIndex} out of range`);
    }
    return frames[frameIndex];
  }

  decodeFrame(shapeIndex, frameIndex) {
    const cacheKey = `${shapeIndex}:${frameIndex}`;
    let decoded = this.decodedFrameCache.get(cacheKey);
    const frame = this.getFrame(shapeIndex, frameIndex);
    if (!decoded) {
      decoded = decodePixels(frame);
      this.decodedFrameCache.set(cacheKey, decoded);
    }
    return { frame, pixels: decoded };
  }

  getShape(shapeIndex) {
    if (this.shapeCache.has(shapeIndex)) {
      return this.shapeCache.get(shapeIndex);
    }
    const raw = this.archive.get(shapeIndex);
    if (!raw.length) {
      throw new Error(`shape ${shapeIndex} has no data`);
    }
    const frames = parseShape(raw);
    this.shapeCache.set(shapeIndex, frames);
    return frames;
  }
}

function parseShape(data) {
  const frameCount = readU16LE(data, 4);
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const headerOffset = 6 + index * 8;
    const frameOffset = readU24LE(data, headerOffset);
    const frameSize = readU32LE(data, headerOffset + 4);
    const frameData = data.subarray(frameOffset, frameOffset + frameSize);
    if (frameData.length < 28) {
      throw new Error(`frame ${index} too small: ${frameData.length}`);
    }
    const compressed = Boolean(readU32LE(frameData, 8));
    const width = readU32LE(frameData, 12);
    const height = readU32LE(frameData, 16);
    const xoff = readI32LE(frameData, 20);
    const yoff = readI32LE(frameData, 24);
    const lineOffsets = [];
    for (let row = 0; row < height; row += 1) {
      lineOffsets.push(readU32LE(frameData, 28 + row * 4) - ((height - row) * 4));
    }
    const rleOffset = 28 + height * 4;
    frames.push({
      compressed,
      width,
      height,
      xoff,
      yoff,
      lineOffsets,
      rleData: frameData.subarray(rleOffset)
    });
  }
  return frames;
}

function decodePixels(frame) {
  const pixels = new Int16Array(frame.width * frame.height);
  pixels.fill(-1);
  const rle = frame.rleData;
  for (let row = 0; row < frame.height; row += 1) {
    let pos = frame.lineOffsets[row];
    let xpos = 0;
    while (xpos < frame.width) {
      if (pos >= rle.length) {
        throw new Error(`row ${row} overran RLE data`);
      }
      xpos += rle[pos];
      pos += 1;
      if (xpos === frame.width) {
        break;
      }
      if (pos >= rle.length) {
        throw new Error(`row ${row} missing run header`);
      }
      let dlen = rle[pos];
      pos += 1;
      let runType = 0;
      if (frame.compressed) {
        runType = dlen & 1;
        dlen >>= 1;
      }
      if (dlen <= 0 || xpos + dlen > frame.width) {
        throw new Error(`invalid run length ${dlen} at row ${row}`);
      }
      const rowBase = row * frame.width + xpos;
      if (runType === 0) {
        const end = pos + dlen;
        if (end > rle.length) {
          throw new Error(`row ${row} literal run overruns RLE data`);
        }
        for (let index = 0; index < dlen; index += 1) {
          pixels[rowBase + index] = rle[pos + index];
        }
        pos = end;
      } else {
        if (pos >= rle.length) {
          throw new Error(`row ${row} repeated-color run missing color byte`);
        }
        const color = rle[pos];
        pos += 1;
        for (let index = 0; index < dlen; index += 1) {
          pixels[rowBase + index] = color;
        }
      }
      xpos += dlen;
    }
  }
  return pixels;
}

export function loadPalette(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length < 768) {
    throw new Error(`palette too small: ${filePath}`);
  }
  const palette = [];
  for (let index = 0; index < 256; index += 1) {
    const r = Math.floor((data[index * 3] * 255) / 63);
    const g = Math.floor((data[index * 3 + 1] * 255) / 63);
    const b = Math.floor((data[index * 3 + 2] * 255) / 63);
    palette.push([r, g, b]);
  }
  return palette;
}

export function loadXformPalette(filePath) {
  const archive = new FlexArchive(filePath);
  const entry = archive.get(0);
  if (entry.length < 0x100) {
    throw new Error(`xform palette entry too small: ${filePath}`);
  }
  return {
    primaryRemap: Uint8Array.from(entry.subarray(0, 0x100))
  };
}

export function loadTypeflags(filePath) {
  const data = fs.readFileSync(filePath);
  const infos = [];
  for (let base = 0; base + 9 <= data.length; base += 9) {
    const block = data.subarray(base, base + 9);
    let flags = 0;
    if (block[0] & 0x01) flags |= 0x0001;
    if (block[0] & 0x02) flags |= 0x0002;
    if (block[0] & 0x04) flags |= 0x0004;
    if (block[0] & 0x08) flags |= 0x0008;
    if (block[0] & 0x10) flags |= 0x0010;
    if (block[0] & 0x20) flags |= 0x0020;
    if (block[0] & 0x40) flags |= 0x0040;
    if (block[0] & 0x80) flags |= 0x0080;
    if (block[1] & 0x01) flags |= 0x0100;
    if (block[1] & 0x02) flags |= 0x0200;
    if (block[1] & 0x04) flags |= 0x0400;
    if (block[1] & 0x08) flags |= 0x0800;
    if (block[6] & 0x01) flags |= 0x1000;
    if (block[6] & 0x02) flags |= 0x2000;
    if (block[6] & 0x04) flags |= 0x4000;
    if (block[6] & 0x08) flags |= 0x8000;
    if (block[6] & 0x10) flags |= 0x10000;
    if (block[6] & 0x20) flags |= 0x20000;
    if (block[6] & 0x40) flags |= 0x40000;
    if (block[6] & 0x80) flags |= 0x80000;
    const family = (block[1] >> 4) + ((block[2] & 1) << 4);
    const x = ((block[3] << 3) | (block[2] >> 5)) & 0x1f;
    const y = (block[3] >> 2) & 0x1f;
    const z = ((block[4] << 1) | (block[3] >> 7)) & 0x1f;
    const animType = block[4] >> 4;
    infos.push({
      family,
      flags,
      x,
      y,
      z,
      animType,
      isEditor: Boolean(flags & 0x1000),
      isFixed: Boolean(flags & SI_FIXED),
      isSolid: Boolean(flags & SI_SOLID),
      isLand: Boolean(flags & SI_LAND),
      isOccl: Boolean(flags & SI_OCCL),
      isNoisy: Boolean(flags & SI_NOISY),
      isDraw: Boolean(flags & SI_DRAW),
      isRoof: Boolean(flags & SI_ROOF),
      isTranslucent: Boolean(flags & SI_TRANSL),
      isInvitem: family === 13
    });
  }
  return infos;
}

export function loadGlobs(filePath) {
  const archive = new FlexArchive(filePath);
  const globs = [];
  for (let index = 0; index < archive.length; index += 1) {
    const raw = archive.get(index);
    if (!raw.length) {
      globs.push([]);
      continue;
    }
    const count = readU16LE(raw, 0);
    const items = [];
    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      const base = 2 + itemIndex * 6;
      items.push({
        x: raw[base],
        y: raw[base + 1],
        z: raw[base + 2],
        shape: readU16LE(raw, base + 3),
        frame: raw[base + 5]
      });
    }
    globs.push(items);
  }
  return globs;
}

export function loadMapItems(filePath, mapIndex) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return parseMapItemsBuffer(loadMapPayload(filePath, mapIndex), "fixed").map((item, index) => ({
    ...item,
    sourceRecordIndex: index
  }));
}

export function expandGlobItem(item, globs) {
  if (item.quality < 0 || item.quality >= globs.length) {
    return [];
  }
  return globs[item.quality].map((globItem) => ({
    x: (item.x & GLOB_COORD_MASK) + (globItem.x << GLOB_COORD_SHIFT) + GLOB_COORD_OFFSET,
    y: (item.y & GLOB_COORD_MASK) + (globItem.y << GLOB_COORD_SHIFT) + GLOB_COORD_OFFSET,
    z: item.z + globItem.z,
    shape: globItem.shape,
    frame: globItem.frame,
    flags: 0,
    quality: 0,
    npcNum: 0,
    mapNum: item.mapNum,
    nextItem: 0,
    source: "glob"
  }));
}

export function collectRenderItems(baseItems, shapeInfos, globs, options) {
  const {
    includeEditor,
    expandGlobs,
    worldRect,
    includeRoofs,
    includeHiddenMarkers,
    progress,
    checkpointEvery = 0
  } = options;

  const renderItems = [];
  const pending = [...baseItems];
  let index = 0;
  let skippedInvisible = 0;
  let skippedWorldRect = 0;
  let skippedInvalidShape = 0;
  let skippedEditor = 0;
  let skippedEgg = 0;
  let skippedRoof = 0;
  let skippedHidden = 0;
  let expandedGlobs = 0;

  while (index < pending.length) {
    const item = pending[index];
    index += 1;
    if (item.flags & FLAG_INVISIBLE) {
      if (!includeHiddenMarkers) {
        skippedHidden += 1;
        continue;
      }
      skippedInvisible += 1;
    }
    if (worldRect) {
      const [minX, minY, maxX, maxY] = worldRect;
      if (item.x < minX || item.y < minY || item.x > maxX || item.y > maxY) {
        skippedWorldRect += 1;
        continue;
      }
    }
    if (item.shape >= shapeInfos.length) {
      skippedInvalidShape += 1;
      continue;
    }
    const info = shapeInfos[item.shape];
    if (info.isEditor && !includeEditor) {
      skippedEditor += 1;
      continue;
    }
    if (info.isRoof && !includeRoofs) {
      skippedRoof += 1;
      continue;
    }
    if (expandGlobs && info.family === 3 && item.source === "fixed") {
      pending.push(...expandGlobItem(item, globs));
      expandedGlobs += 1;
      if (!includeHiddenMarkers) {
        continue;
      }
    }
    if (EGG_FAMILIES.has(info.family) && !includeHiddenMarkers) {
      skippedEgg += 1;
      continue;
    }
    renderItems.push(item);
    if (progress && checkpointEvery > 0 && index % checkpointEvery === 0) {
      progress(
        `collect processed=${index} pending=${pending.length} rendered=${renderItems.length} expanded_globs=${expandedGlobs} ` +
          `skipped=(invisible:${skippedInvisible}, world:${skippedWorldRect}, shape:${skippedInvalidShape}, editor:${skippedEditor}, ` +
          `roof:${skippedRoof}, hidden:${skippedHidden}, egg:${skippedEgg})`
      );
    }
  }

  if (progress) {
    progress(
      `collect complete processed=${index} pending=${pending.length} rendered=${renderItems.length} expanded_globs=${expandedGlobs} ` +
        `skipped=(invisible:${skippedInvisible}, world:${skippedWorldRect}, shape:${skippedInvalidShape}, editor:${skippedEditor}, ` +
        `roof:${skippedRoof}, hidden:${skippedHidden}, egg:${skippedEgg})`
    );
  }

  return renderItems;
}

export function summarizeRenderClasses(baseItems, shapeInfos) {
  const summary = {
    roofItems: 0,
    editorItems: 0,
    eggFamilyItems: 0,
    invisibleFlaggedItems: 0,
    npcLinkedItems: 0
  };
  for (const item of baseItems) {
    if (item.flags & FLAG_INVISIBLE) {
      summary.invisibleFlaggedItems += 1;
    }
    if (item.npcNum !== 0) {
      summary.npcLinkedItems += 1;
    }
    if (item.shape >= shapeInfos.length) {
      continue;
    }
    const info = shapeInfos[item.shape];
    if (info.isRoof) summary.roofItems += 1;
    if (info.isEditor) summary.editorItems += 1;
    if (EGG_FAMILIES.has(info.family)) summary.eggFamilyItems += 1;
  }
  return summary;
}

export function resolveStaticFile(staticDir, name) {
  return path.join(staticDir, name);
}
