import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { APP_ROOT, SCENE_CACHE_ROOT, TILE_SIZE } from "../config.js";
import { packSprites } from "./atlas-packer.js";
import { ensureShapeCatalogCoverage, getShapeCatalog } from "./catalog.js";
import { getShapeNameTable } from "./dtable.js";
import {
  EGG_FAMILIES,
  FLAG_FLIPPED,
  FLAG_INVISIBLE,
  ShapeArchive,
  collectRenderItems,
  loadGlobs,
  loadMapItems,
  loadPalette,
  loadXformPalette,
  loadTypeflags,
  resolveStaticFile,
  summarizeRenderClasses
} from "./formats.js";
import { buildMapSource, detectDefaultTeleportEggShape, loadMapPayload } from "./map-source.js";
import { getMissionMapTable } from "./mission-map-data.js";
import { extractNpcSpawnerRows } from "./npc-spawner-data.js";
import { blitFrame, encodePng, rgbaBuffer } from "./png.js";
import { prepareSortedItems } from "./sorting.js";

const SCENE_CACHE_VERSION = "v15-atlas-scene-crusader-explicit-semitransparency-only";
const DTABLE_NPC_SHAPES = new Set([0x04d0]);
const MONSTER_EGG_PREVIEW_SHAPE = 0x024f;
const OBSERVER_PREVIEW_FRAME = 0x0f;
const CATALOG_SEMITRANSPARENCY_OPACITY = 0.5;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function normalizeBuildOptions(options = {}) {
  return {
    includeEditor: options.includeEditor !== false,
    includeRoofs: options.includeRoofs === true
  };
}

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function removeLegacyOptionCacheDirs(mapCacheRoot) {
  const legacyDirs = [
    "editor-off_roofs-off",
    "editor-off_roofs-on",
    "editor-on_roofs-off",
    "editor-on_roofs-on"
  ];
  for (const dirName of legacyDirs) {
    fs.rmSync(path.join(mapCacheRoot, dirName), { recursive: true, force: true });
  }
}

function fileStamp(filePath) {
  const stat = fs.statSync(filePath);
  return `${path.basename(filePath)}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
}

function resolveGameAssetPath(gameConfig, name) {
  const directories = [gameConfig.staticDir, ...(gameConfig.fallbackStaticDirs ?? [])];
  for (const directory of directories) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return resolveStaticFile(gameConfig.staticDir, name);
}

function resolveOptionalXformPath(gameConfig) {
  const explicitPath = gameConfig.gameId === "remorse" ? process.env.REMORSE_XFORMPAL_PATH : process.env.REGRET_XFORMPAL_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const staticCandidate = path.join(gameConfig.staticDir, "XFORMPAL.DAT");
  if (fs.existsSync(staticCandidate)) {
    return staticCandidate;
  }

  const siblingCandidate = path.resolve(APP_ROOT, "..", "..", "Crusader", path.basename(gameConfig.staticDir), "XFORMPAL.DAT");
  return fs.existsSync(siblingCandidate) ? siblingCandidate : null;
}

function classifySceneKind(item, info) {
  if ((item.flags & FLAG_INVISIBLE) || info.isOccl || info.isInvitem) {
    return "helper";
  }
  if (EGG_FAMILIES.has(info.family)) {
    return "egg";
  }
  if (info.isRoof) {
    return "roof";
  }
  if (info.isLand) {
    return "terrain";
  }
  if (info.isEditor) {
    return "editor";
  }
  return "base";
}

function sceneLabel(kind) {
  switch (kind) {
    case "helper":
      return "Helper Geometry";
    case "egg":
      return "Egg Trigger";
    case "roof":
      return "Roof Shape";
    case "terrain":
      return "Terrain Shape";
    case "editor":
      return "Editor Object";
    default:
      return "Map Shape";
  }
}

function sceneNotes(item, info) {
  const notes = [];
  if (item.flags & FLAG_INVISIBLE) {
    notes.push("invisible-flagged");
  }
  if (info.isOccl) {
    notes.push("occluding-geometry");
  }
  if (info.isInvitem) {
    notes.push("invitem-family");
  }
  if (EGG_FAMILIES.has(info.family)) {
    notes.push("egg-family");
  }
  if (info.isRoof) {
    notes.push("roof-flagged");
  }
  if (info.isTranslucent) {
    notes.push("translucent");
  }
  if (info.isEditor) {
    notes.push("editor-record");
  }
  if (info.isOob) {
    notes.push("oob-surface");
  }
  return notes;
}

function presentationOpacity(kind, info, catalogEntry) {
  if (catalogEntry?.semitransparency === true && !info.isTranslucent) {
    return CATALOG_SEMITRANSPARENCY_OPACITY;
  }
  return 1;
}

function applyCatalogOverrides(info, catalogEntry) {
  if (!catalogEntry) {
    return info;
  }
  return {
    ...info,
    isRoof: catalogEntry.roof === true,
    isOob: catalogEntry.oob === true
  };
}

function summarizeSceneItems(items) {
  const kindCounts = {};
  const familyCounts = {};
  const sourceCounts = {};

  for (const item of items) {
    kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1;
    familyCounts[item.family] = (familyCounts[item.family] ?? 0) + 1;
    sourceCounts[item.source] = (sourceCounts[item.source] ?? 0) + 1;
  }

  const topFamilies = Object.entries(familyCounts)
    .sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]))
    .slice(0, 8)
    .map(([family, count]) => ({ family: Number(family), count }));

  return {
    itemCount: items.length,
    kindCounts,
    sourceCounts,
    topFamilies,
    helperCount: kindCounts.helper ?? 0
  };
}

function formatMissionHintList(missions) {
  if (!missions.length) {
    return "";
  }
  if (missions.length === 1) {
    return `mission ${missions[0]}`;
  }
  return `missions ${missions.join(", ")}`;
}

function makeUsageInfo(gameId, mapId, baseItems, renderItems) {
  const itemMapNums = [...new Set(baseItems.map((item) => item.mapNum))].sort((left, right) => left - right);
  const missionTable = getMissionMapTable(gameId);
  const baseUsage = {
    itemMapNums,
    nonzeroItemMapNums: itemMapNums.filter((value) => value !== 0),
    npcLinkedItemCount: baseItems.filter((item) => item.npcNum !== 0).length,
    hasRenderableContent: renderItems.length > 0,
    game: gameId,
    map: mapId
  };

  if (!missionTable) {
    return {
      status: "mission-table-cache-missing",
      confidence: "medium",
      knownHints: [],
      note: "Mission table cache missing. Run generate-mission-map-data, build-cache, or export-static to populate the authoritative -warp base-map table.",
      ...baseUsage
    };
  }

  const baseMissionMatches = missionTable.mapToMissions?.[String(mapId)] ?? [];
  if (baseMissionMatches.length) {
    return {
      status: "base-mission-map",
      confidence: "high",
      knownHints: baseMissionMatches.map((mission) => `mission ${mission}`),
      baseMissionMatches,
      tableAddress: missionTable.tableAddress,
      entryCount: missionTable.entryCount,
      baseMaps: missionTable.baseMaps,
      note: `Authoritative executable -warp table ${missionTable.tableAddress} uses map ${mapId} as the base map for ${formatMissionHintList(baseMissionMatches)}. The runtime can still shift that base with -mapoff.`,
      ...baseUsage
    };
  }

  return {
    status: "offset-only-or-unmapped",
    confidence: "high",
    knownHints: [],
    baseMissionMatches: [],
    tableAddress: missionTable.tableAddress,
    entryCount: missionTable.entryCount,
    baseMaps: missionTable.baseMaps,
    note: `Authoritative executable -warp table ${missionTable.tableAddress} has no base entry for map ${mapId}. The runtime can still reach this map through -mapoff from one of the extracted base mission maps.`,
    ...baseUsage
  };
}

function createEmptyScene(gameConfig, mapId, fingerprint, reason) {
  const metadata = {
    game: gameConfig.id,
    gameLabel: gameConfig.label,
    map: mapId,
    rawItemCount: 0,
    itemCount: 0,
    paintedItemCount: 0,
    occludedItemCount: 0,
    invalidItemCount: 0,
    invalidItems: [],
    sceneSummary: {
      atlasCount: 0,
      spriteCount: 0,
      helperCount: 0,
      kindCounts: {},
      sourceCounts: {},
      topFamilies: []
    },
    usage: makeUsageInfo(gameConfig.id, mapId, [], []),
    baseItemSummary: {
      roofItems: 0,
      editorItems: 0,
      eggFamilyItems: 0,
      invisibleFlaggedItems: 0,
      npcLinkedItems: 0
    },
    sorter: "scummvm_dependency_graph",
    isEmpty: true,
    emptyReason: reason,
    bounds: {
      screenLeft: 0,
      screenTop: 0,
      screenRight: TILE_SIZE,
      screenBottom: TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE
    },
    zoom: {
      min: 0.01,
      max: 8,
      step: 0.1,
      initial: 1
    },
    buildFingerprint: fingerprint,
    generatedAt: nowIso()
  };

  return {
    build: {
      version: SCENE_CACHE_VERSION,
      fingerprint,
      generatedAt: metadata.generatedAt,
      cacheMode: "single-scene"
    },
    metadata,
    atlases: [],
    sprites: [],
    shapeDefinitions: [],
    items: [],
    mapSource: null
  };
}

function buildShapeDefinition(info, shape, catalogEntry, dtableEntry = null) {
  const effectiveInfo = applyCatalogOverrides(info, catalogEntry);
  const kind = classifySceneKind({ flags: 0 }, effectiveInfo);
  return {
    id: `shape:${shape}`,
    shape,
    shapeHex: toHex(shape),
    family: info.family,
    label: sceneLabel(kind),
    kind,
    displayName: catalogEntry?.humanReadableId || dtableEntry?.humanReadableId || `shape_${shape.toString(16).padStart(4, "0")}`,
    description: catalogEntry?.description || dtableEntry?.description || "",
    dimensions: {
      x: info.x,
      y: info.y,
      z: info.z
    },
    visibilityTags: [
      ...(effectiveInfo.isRoof ? ["roof"] : []),
      ...(effectiveInfo.isEditor ? ["editor"] : []),
      ...(effectiveInfo.isOccl || effectiveInfo.isInvitem ? ["helper"] : []),
      ...(effectiveInfo.isOob ? ["oob"] : []),
      ...(EGG_FAMILIES.has(effectiveInfo.family) ? ["egg"] : [])
    ],
    traits: {
      editor: effectiveInfo.isEditor,
      roof: effectiveInfo.isRoof,
      oob: effectiveInfo.isOob,
      occluding: effectiveInfo.isOccl,
      translucent: effectiveInfo.isTranslucent,
      solid: effectiveInfo.isSolid,
      fixed: effectiveInfo.isFixed,
      land: effectiveInfo.isLand,
      draw: effectiveInfo.isDraw,
      invitem: effectiveInfo.isInvitem,
      animType: effectiveInfo.animType
    },
    catalogEntry: {
      humanReadableId: catalogEntry?.humanReadableId ?? "",
      description: catalogEntry?.description ?? "",
      roof: catalogEntry?.roof ?? null,
      semitransparency: catalogEntry?.semitransparency ?? null,
      oob: catalogEntry?.oob ?? null
    },
    catalogOverrides: {
      roof: catalogEntry?.roof ?? null,
      semitransparency: catalogEntry?.semitransparency ?? null,
      oob: catalogEntry?.oob ?? null
    },
    tableFallback: dtableEntry
      ? {
          humanReadableId: dtableEntry.humanReadableId,
          description: dtableEntry.description,
          resolvedCategory: dtableEntry.resolvedCategory,
          displayFrameHex: dtableEntry.displayFrameHex
        }
      : null
  };
}

function buildEggMetadata(item, info) {
  if (!EGG_FAMILIES.has(info.family)) {
    return null;
  }

  const rawQuality = item.quality & 0xffff;
  const rawMapNum = item.mapNum & 0xff;
  const rawNpcNum = item.npcNum & 0xff;

  switch (info.family) {
    case 8:
      return {
        family: info.family,
        type: item.frame === 1 ? "teleport-destination" : "teleporter",
        labelKind: "teleport-id",
        labelId: rawQuality & 0xff,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 7:
      return {
        family: info.family,
        type: "monster-spawn",
        labelKind: "monster-id",
        labelId: rawMapNum >> 3,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 4:
      return {
        family: info.family,
        type: "usecode-trigger",
        labelKind: "egg-id",
        labelId: rawMapNum,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 3:
      return {
        family: info.family,
        type: "glob",
        labelKind: "glob-id",
        labelId: rawQuality,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    default:
      return {
        family: info.family,
        type: "egg",
        labelKind: "egg-id",
        labelId: rawMapNum || rawQuality,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
  }
}

function selectTeleportEggTemplate(baseItems, shapeInfos, shapeArchive) {
  const counts = new Map();
  for (const item of baseItems) {
    if (shapeInfos[item.shape]?.family !== 8) {
      continue;
    }
    const key = `${item.shape}:${item.frame}`;
    counts.set(key, {
      shape: item.shape,
      frame: item.frame,
      count: (counts.get(key)?.count ?? 0) + 1
    });
  }

  const existing = [...counts.values()].sort((left, right) => right.count - left.count || left.shape - right.shape || left.frame - right.frame)[0];
  if (existing) {
    const frameCount = shapeArchive.getShape(existing.shape).length;
    return {
      shape: existing.shape,
      frame: existing.frame,
      teleporterFrame: frameCount > 0 ? 0 : existing.frame,
      destinationFrame: frameCount > 1 ? 1 : existing.frame
    };
  }

  const fallbackShape = detectDefaultTeleportEggShape(shapeInfos);
  if (!Number.isInteger(fallbackShape)) {
    return null;
  }

  const frameCount = shapeArchive.getShape(fallbackShape).length;
  return {
    shape: fallbackShape,
    frame: frameCount > 1 ? 1 : 0,
    teleporterFrame: 0,
    destinationFrame: frameCount > 1 ? 1 : 0
  };
}

function isSpriteTranslucent(shape, shapeInfos, catalogEntries) {
  const info = shapeInfos[shape] ?? {};
  return info.isTranslucent === true;
}

function ensureSpriteEntry(spriteMap, shapeArchive, shapeInfos, catalogEntries, shape, frame) {
  const spriteId = `sprite:${shape}:${frame}`;
  if (spriteMap.has(spriteId)) {
    return spriteId;
  }
  const frameData = shapeArchive.getFrame(shape, frame);
  const { pixels } = shapeArchive.decodeFrame(shape, frame);
  spriteMap.set(spriteId, {
    id: spriteId,
    shape,
    frame,
    width: frameData.width,
    height: frameData.height,
    frameData,
    pixels,
    translucent: isSpriteTranslucent(shape, shapeInfos, catalogEntries)
  });
  return spriteId;
}

function chooseNpcPreviewFrame(row, shapeArchive) {
  let frames;
  try {
    frames = shapeArchive.getShape(row.shape);
  } catch {
    return null;
  }
  if (!frames?.length) {
    return null;
  }
  if (row.name?.trim().toLowerCase() === "observer" && frames.length > OBSERVER_PREVIEW_FRAME) {
    return OBSERVER_PREVIEW_FRAME;
  }
  return 0;
}

function canUseNpcPreview(item, info) {
  if (!Number.isInteger(item?.npcNum) || item.npcNum <= 0) {
    return false;
  }
  if (DTABLE_NPC_SHAPES.has(item.shape)) {
    return true;
  }
  return item.shape === MONSTER_EGG_PREVIEW_SHAPE && item.frame === 0 && info?.family === 7;
}

function buildNpcPreview(item, info, npcSpawnerRowIndex, shapeArchive) {
  if (!canUseNpcPreview(item, info)) {
    return null;
  }

  const row = npcSpawnerRowIndex.get(item.npcNum) ?? null;
  if (!row || !Number.isInteger(row.shape) || row.shape < 0) {
    return null;
  }

  const frame = chooseNpcPreviewFrame(row, shapeArchive);
  if (!Number.isInteger(frame)) {
    return null;
  }

  return {
    index: row.index,
    name: row.name,
    shape: row.shape,
    frame,
    spriteId: `sprite:${row.shape}:${frame}`,
    shapeDefId: `shape:${row.shape}`
  };
}

function buildItemPreview(item, shapeInfos, shapeArchive) {
  if (item?.shape !== 0x0476 || !Number.isInteger(item?.npcNum) || !Number.isInteger(item?.mapNum)) {
    return null;
  }

  const shape = (item.mapNum & 0xffff) + ((item.npcNum & 0x00e0) * 8);
  if (!Number.isInteger(shape) || shape <= 0 || !shapeInfos[shape]) {
    return null;
  }

  const rawFrame = item.npcNum & 0x0f;
  let frames;
  try {
    frames = shapeArchive.getShape(shape);
  } catch {
    return null;
  }
  if (!frames?.length) {
    return null;
  }

  const frame = Math.min(rawFrame, frames.length - 1);
  return {
    shape,
    frame,
    rawFrame,
    spriteId: `sprite:${shape}:${frame}`,
    shapeDefId: `shape:${shape}`
  };
}

function serializeSceneItem(node, minLeft, minTop, index, catalogEntry, dtableEntry = null, npcPreview = null, itemPreview = null) {
  const { item, info, frame } = node;
  const effectiveInfo = applyCatalogOverrides(info, catalogEntry);
  const kind = classifySceneKind(item, effectiveInfo);

  return {
    id: `item:${index}:${item.source}:${item.shape}:${item.frame}:${item.x}:${item.y}:${item.z}`,
    mapSourceIndex: item.source === "fixed" && Number.isInteger(item.sourceRecordIndex) ? item.sourceRecordIndex : null,
    drawOrder: index,
    kind,
    label: sceneLabel(kind),
    source: item.source,
    world: {
      x: item.x,
      y: item.y,
      z: item.z
    },
    mapNum: item.mapNum,
    npcNum: item.npcNum,
    nextItem: item.nextItem,
    quality: item.quality,
    frame: item.frame,
    screen: {
      left: node.left - minLeft,
      top: node.top - minTop,
      right: node.right - minLeft,
      bottom: node.bottom - minTop,
      width: node.right - node.left,
      height: node.bottom - node.top,
      anchorX: Math.trunc(node.left - minLeft + (node.right - node.left) / 2),
      anchorY: node.bottom - minTop
    },
    flags: {
      raw: item.flags,
      hex: toHex(item.flags),
      invisible: Boolean(item.flags & FLAG_INVISIBLE),
      flipped: Boolean(item.flags & FLAG_FLIPPED)
    },
    presentation: {
      opacity: presentationOpacity(kind, effectiveInfo, catalogEntry),
      visibilityDefault: true
    },
    notes: sceneNotes(item, effectiveInfo),
    frameSize: {
      width: frame.width,
      height: frame.height,
      xoff: frame.xoff,
      yoff: frame.yoff
    },
    egg: buildEggMetadata(item, effectiveInfo),
    npcPreview: npcPreview ? {
      index: npcPreview.index,
      name: npcPreview.name,
      shape: npcPreview.shape,
      shapeHex: toHex(npcPreview.shape),
      frame: npcPreview.frame,
      shapeDefId: npcPreview.shapeDefId,
      spriteId: npcPreview.spriteId
    } : null,
    itemPreview: itemPreview ? {
      shape: itemPreview.shape,
      shapeHex: toHex(itemPreview.shape),
      frame: itemPreview.frame,
      rawFrame: itemPreview.rawFrame,
      shapeDefId: itemPreview.shapeDefId,
      spriteId: itemPreview.spriteId
    } : null,
    shapeDefId: `shape:${item.shape}`,
    spriteId: `sprite:${item.shape}:${item.frame}`
  };
}

function serializeSprite(sprite, placement) {
  return {
    id: sprite.id,
    atlasId: placement.atlasId,
    shape: sprite.shape,
    frame: sprite.frame,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    xoff: sprite.frameData.xoff,
    yoff: sprite.frameData.yoff
  };
}

function collectObservedShapes(renderItems, shapeInfos) {
  const observed = new Map();
  for (const item of renderItems) {
    const info = shapeInfos[item.shape] ?? {};
    if (!observed.has(item.shape)) {
      const kind = classifySceneKind({ flags: 0 }, info);
      observed.set(item.shape, {
        shapeCode: item.shape,
        isEditor: Boolean(info.isEditor),
        categorization: kind,
        qualitySet: new Set()
      });
    }
    observed.get(item.shape).qualitySet.add(item.quality);
  }
  return [...observed.values()]
    .map((entry) => ({
      shapeCode: entry.shapeCode,
      isEditor: entry.isEditor,
      categorization: entry.categorization,
      qualities: [...entry.qualitySet].sort((left, right) => left - right).join(";")
    }))
    .sort((left, right) => left.shapeCode - right.shapeCode);
}

export class BuildManager {
  constructor(catalog) {
    this.catalog = catalog;
    this.assetCache = new Map();
    this.jobs = new Map();
    this.jobsByKey = new Map();
    ensureDir(SCENE_CACHE_ROOT);
  }

  listCatalog() {
    return this.catalog;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  invalidateGameCache(gameId) {
    const gameCacheRoot = path.join(SCENE_CACHE_ROOT, gameId);
    fs.rmSync(gameCacheRoot, { recursive: true, force: true });
    for (const [key, job] of this.jobsByKey.entries()) {
      if (job.game === gameId) {
        this.jobsByKey.delete(key);
      }
    }
    return {
      game: gameId,
      cacheRoot: gameCacheRoot
    };
  }

  computeBuildFingerprint(gameConfig, mapId, options, catalogInfo, dtableInfo) {
    const relevantFiles = [
      resolveGameAssetPath(gameConfig, "FIXED.DAT"),
      resolveGameAssetPath(gameConfig, "GAMEPAL.PAL"),
      resolveGameAssetPath(gameConfig, "TYPEFLAG.DAT"),
      resolveGameAssetPath(gameConfig, "GLOB.FLX"),
      resolveGameAssetPath(gameConfig, "SHAPES.FLX")
    ];
    const xformPath = resolveOptionalXformPath(gameConfig);
    if (xformPath) {
      relevantFiles.push(xformPath);
    }

    return sha1(
      JSON.stringify({
        version: SCENE_CACHE_VERSION,
        game: gameConfig.id,
        mapId,
        files: relevantFiles.map((filePath) => fileStamp(filePath)),
        catalogDigest: catalogInfo.digest,
        dtableDigest: dtableInfo?.digest ?? "missing"
      })
    ).slice(0, 16);
  }

  ensureCatalogCoverage(gameConfig, mapId) {
    const assets = this.getAssets(gameConfig);
    const fixedDatPath = resolveGameAssetPath(gameConfig, "FIXED.DAT");
    const baseItems = loadMapItems(fixedDatPath, mapId);
    const renderItems = collectRenderItems(baseItems, assets.shapeInfos, assets.globs, {
      includeEditor: true,
      expandGlobs: true,
      worldRect: null,
      includeRoofs: true,
      includeHiddenMarkers: true
    });
    return ensureShapeCatalogCoverage(gameConfig.id, collectObservedShapes(renderItems, assets.shapeInfos));
  }

  async createOrReuseBuild(gameConfig, mapId, rawOptions = {}) {
    const options = normalizeBuildOptions(rawOptions);
    this.ensureCatalogCoverage(gameConfig, mapId);
    const catalogInfo = getShapeCatalog(gameConfig.id);
    const dtableInfo = getShapeNameTable(gameConfig.id);
    const fingerprint = this.computeBuildFingerprint(gameConfig, mapId, options, catalogInfo, dtableInfo);
    const key = `${gameConfig.id}:${mapId}:${fingerprint}`;
    const existing = this.jobsByKey.get(key);
    if (existing) {
      if (existing.status === "ready" || existing.status === "building") {
        return existing;
      }
      this.jobsByKey.delete(key);
    }

    const job = {
      id: crypto.randomUUID(),
      key,
      fingerprint,
      game: gameConfig.id,
      mapId,
      options,
      status: "queued",
      phase: "queued",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      progress: [],
      error: null,
      metadata: null,
      build: null,
      promise: null
    };
    this.jobs.set(job.id, job);
    this.jobsByKey.set(key, job);
    job.promise = this.runBuild(job, gameConfig, catalogInfo, dtableInfo);
    return job;
  }

  async runBuild(job, gameConfig, catalogInfo, dtableInfo) {
    try {
      job.status = "building";
      job.phase = "loading-assets";
      this.touchJob(job, `Preparing ${gameConfig.label} assets`);

      const scene = await this.ensureSceneArtifacts(gameConfig, job.mapId, job.options, job.fingerprint, catalogInfo, dtableInfo, {
        progress: (phase, message) => {
          job.phase = phase;
          this.touchJob(job, message);
        }
      });

      job.build = scene;
      job.metadata = scene.metadata;
      job.status = "ready";
      job.phase = "ready";
      this.touchJob(
        job,
        `Scene ready with ${scene.metadata.sceneSummary.spriteCount} sprites across ${scene.metadata.sceneSummary.atlasCount} atlases`
      );
    } catch (error) {
      job.status = "failed";
      job.phase = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      this.touchJob(job, `Build failed: ${job.error}`);
    }
  }

  getAssets(gameConfig) {
    const palettePath = resolveGameAssetPath(gameConfig, "GAMEPAL.PAL");
    const typeflagPath = resolveGameAssetPath(gameConfig, "TYPEFLAG.DAT");
    const globPath = resolveGameAssetPath(gameConfig, "GLOB.FLX");
    const shapesPath = resolveGameAssetPath(gameConfig, "SHAPES.FLX");
    const dtablePath = resolveGameAssetPath(gameConfig, "DTABLE.FLX");
    const xformPath = resolveOptionalXformPath(gameConfig);
    const stamp = [palettePath, typeflagPath, globPath, shapesPath, dtablePath, xformPath].filter(Boolean).map((filePath) => fileStamp(filePath)).join("|");
    const cached = this.assetCache.get(gameConfig.id);
    if (cached?.stamp === stamp) {
      return cached.assets;
    }

    const npcSpawnerRows = extractNpcSpawnerRows(dtablePath);

    const assets = {
      palette: loadPalette(palettePath),
      xformPalette: xformPath ? loadXformPalette(xformPath) : null,
      shapeInfos: loadTypeflags(typeflagPath),
      globs: loadGlobs(globPath),
      shapeArchive: new ShapeArchive(shapesPath),
      npcSpawnerRows,
      npcSpawnerRowIndex: new Map(npcSpawnerRows.map((row) => [row.index, row]))
    };
    this.assetCache.set(gameConfig.id, { stamp, assets });
    return assets;
  }

  async ensureSceneArtifacts(gameConfig, mapId, options, fingerprint, catalogInfo, dtableInfo, hooks = {}) {
    const mapCacheRoot = path.join(SCENE_CACHE_ROOT, gameConfig.id, `map-${mapId}`);
    removeLegacyOptionCacheDirs(mapCacheRoot);
    const cacheDir = path.join(mapCacheRoot, fingerprint);
    const sceneFilePath = path.join(cacheDir, "scene.json");

    hooks.progress?.("cache-check", `Checking cached scene artifacts for ${gameConfig.id} map ${mapId}`);
    if (fs.existsSync(sceneFilePath)) {
      const cachedScene = JSON.parse(fs.readFileSync(sceneFilePath, "utf8"));
      const allAtlasesPresent = cachedScene.atlases.every((atlas) => fs.existsSync(path.join(cacheDir, atlas.fileName)));
      if (allAtlasesPresent) {
        hooks.progress?.("cache-hit", `Using cached atlas and scene data for ${gameConfig.id} map ${mapId}`);
        return {
          ...cachedScene,
          cacheDir,
          sceneFilePath,
          atlasFiles: cachedScene.atlases.map((atlas) => ({
            ...atlas,
            filePath: path.join(cacheDir, atlas.fileName)
          }))
        };
      }
    }

    const assets = this.getAssets(gameConfig);
    const fixedDatPath = resolveGameAssetPath(gameConfig, "FIXED.DAT");
    hooks.progress?.("loading-map", `Loading FIXED.DAT map ${mapId}`);
    const mapPayload = loadMapPayload(fixedDatPath, mapId);
    const baseItems = loadMapItems(fixedDatPath, mapId);
    const teleportEggTemplate = selectTeleportEggTemplate(baseItems, assets.shapeInfos, assets.shapeArchive);
    const mapSource = buildMapSource(
      gameConfig.id,
      mapId,
      baseItems,
      teleportEggTemplate,
      mapPayload.length
    );

    hooks.progress?.("collecting-items", `Collecting renderable items for map ${mapId}`);
    const renderItems = collectRenderItems(baseItems, assets.shapeInfos, assets.globs, {
      includeEditor: true,
      expandGlobs: true,
      worldRect: null,
      includeRoofs: true,
      includeHiddenMarkers: true,
      checkpointEvery: 2000,
      progress: (message) => hooks.progress?.("collecting-items", message)
    });

    if (!renderItems.length) {
      ensureDir(cacheDir);
      const emptyScene = createEmptyScene(
        gameConfig,
        mapId,
        fingerprint,
        "This map has no renderable items in FIXED.DAT."
      );
      emptyScene.metadata.rawItemCount = baseItems.length;
      emptyScene.metadata.usage = makeUsageInfo(gameConfig.id, mapId, baseItems, []);
      emptyScene.metadata.baseItemSummary = summarizeRenderClasses(baseItems, assets.shapeInfos);
      emptyScene.mapSource = mapSource;
      fs.writeFileSync(sceneFilePath, JSON.stringify(emptyScene, null, 2));
      return {
        ...emptyScene,
        cacheDir,
        sceneFilePath,
        atlasFiles: []
      };
    }

    hooks.progress?.("sorting", `Sorting ${renderItems.length} decoded items`);
    const sorted = prepareSortedItems(renderItems, assets.shapeArchive, assets.shapeInfos, {
      checkpointEvery: 2000,
      maxInvalidDetails: 20,
      progress: (message) => hooks.progress?.("sorting", message)
    });

    if (!sorted.prepared.length) {
      ensureDir(cacheDir);
      const emptyScene = createEmptyScene(
        gameConfig,
        mapId,
        fingerprint,
        "This map resolved to no valid shape or frame pairs after decoding."
      );
      emptyScene.metadata.rawItemCount = baseItems.length;
      emptyScene.metadata.usage = makeUsageInfo(gameConfig.id, mapId, baseItems, renderItems);
      emptyScene.metadata.baseItemSummary = summarizeRenderClasses(baseItems, assets.shapeInfos);
      emptyScene.metadata.invalidItemCount = sorted.invalidItemCount;
      emptyScene.metadata.invalidItems = sorted.invalidItems;
      emptyScene.mapSource = mapSource;
      fs.writeFileSync(sceneFilePath, JSON.stringify(emptyScene, null, 2));
      return {
        ...emptyScene,
        cacheDir,
        sceneFilePath,
        atlasFiles: []
      };
    }

    const spriteMap = new Map();
    const npcPreviews = sorted.prepared.map((node) => buildNpcPreview(node.item, node.info, assets.npcSpawnerRowIndex, assets.shapeArchive));
    const itemPreviews = sorted.prepared.map((node) => buildItemPreview(node.item, assets.shapeInfos, assets.shapeArchive));
    for (const [index, node] of sorted.prepared.entries()) {
      const spriteId = `sprite:${node.item.shape}:${node.item.frame}`;
      if (!spriteMap.has(spriteId)) {
        spriteMap.set(spriteId, {
          id: spriteId,
          shape: node.item.shape,
          frame: node.item.frame,
          width: node.frame.width,
          height: node.frame.height,
          frameData: node.frame,
          pixels: node.pixels,
          translucent: node.info.isTranslucent === true
        });
      }

      const npcPreview = npcPreviews[index];
      if (npcPreview) {
        ensureSpriteEntry(spriteMap, assets.shapeArchive, assets.shapeInfos, catalogInfo.entries, npcPreview.shape, npcPreview.frame);
      }

      const itemPreview = itemPreviews[index];
      if (itemPreview) {
        ensureSpriteEntry(spriteMap, assets.shapeArchive, assets.shapeInfos, catalogInfo.entries, itemPreview.shape, itemPreview.frame);
      }
    }
    if (teleportEggTemplate) {
      for (const frameIndex of new Set([teleportEggTemplate.teleporterFrame, teleportEggTemplate.destinationFrame])) {
        ensureSpriteEntry(spriteMap, assets.shapeArchive, assets.shapeInfos, catalogInfo.entries, teleportEggTemplate.shape, frameIndex);
      }
    }

    hooks.progress?.("packing-atlases", `Packing ${spriteMap.size} unique sprites into atlases`);
    const packed = packSprites(
      [...spriteMap.values()].map((sprite) => ({
        id: sprite.id,
        width: sprite.width,
        height: sprite.height
      }))
    );

    ensureDir(cacheDir);
    const atlasFiles = [];
    for (const atlas of packed.atlases) {
      hooks.progress?.("writing-atlases", `Encoding ${atlas.id} (${atlas.width}x${atlas.height})`);
      const buffer = rgbaBuffer(atlas.width, atlas.height, [0, 0, 0, 0]);
      for (const placed of atlas.sprites) {
        const sprite = spriteMap.get(placed.id);
        blitFrame(buffer, atlas.width, atlas.height, placed.x, placed.y, sprite.frameData, sprite.pixels, assets.palette, false, {
          translucent: sprite.translucent,
          xformBlendMap: assets.xformPalette?.primaryBlendMap ?? null,
          xformBlendRgbRemap: assets.xformPalette?.primaryBlendRgbRemap ?? null
        });
      }
      const fileName = `${atlas.id}.png`;
      const filePath = path.join(cacheDir, fileName);
      fs.writeFileSync(filePath, encodePng(atlas.width, atlas.height, buffer));
      atlasFiles.push({
        id: atlas.id,
        fileName,
        filePath,
        width: atlas.width,
        height: atlas.height
      });
    }

    const shapeDefinitionMap = new Map();
    for (const [index, node] of sorted.prepared.entries()) {
      const shapeDefId = `shape:${node.item.shape}`;
      if (!shapeDefinitionMap.has(shapeDefId)) {
        const catalogEntry = catalogInfo.entries.get(node.item.shape) ?? null;
        const dtableEntry = dtableInfo.entries.get(node.item.shape) ?? null;
        shapeDefinitionMap.set(shapeDefId, buildShapeDefinition(node.info, node.item.shape, catalogEntry, dtableEntry));
      }

      const npcPreview = npcPreviews[index];
      if (npcPreview && !shapeDefinitionMap.has(npcPreview.shapeDefId)) {
        shapeDefinitionMap.set(
          npcPreview.shapeDefId,
          buildShapeDefinition(
            assets.shapeInfos[npcPreview.shape],
            npcPreview.shape,
            catalogInfo.entries.get(npcPreview.shape) ?? null,
            dtableInfo.entries.get(npcPreview.shape) ?? null
          )
        );
      }

      const itemPreview = itemPreviews[index];
      if (itemPreview && !shapeDefinitionMap.has(itemPreview.shapeDefId)) {
        shapeDefinitionMap.set(
          itemPreview.shapeDefId,
          buildShapeDefinition(
            assets.shapeInfos[itemPreview.shape],
            itemPreview.shape,
            catalogInfo.entries.get(itemPreview.shape) ?? null,
            dtableInfo.entries.get(itemPreview.shape) ?? null
          )
        );
      }
    }
    if (teleportEggTemplate) {
      const shapeDefId = `shape:${teleportEggTemplate.shape}`;
      if (!shapeDefinitionMap.has(shapeDefId)) {
        shapeDefinitionMap.set(
          shapeDefId,
          buildShapeDefinition(
            assets.shapeInfos[teleportEggTemplate.shape],
            teleportEggTemplate.shape,
            catalogInfo.entries.get(teleportEggTemplate.shape) ?? null,
            dtableInfo.entries.get(teleportEggTemplate.shape) ?? null
          )
        );
      }
    }

    const items = sorted.prepared.map((node, index) =>
      serializeSceneItem(
        node,
        sorted.minLeft,
        sorted.minTop,
        index,
        catalogInfo.entries.get(node.item.shape) ?? null,
        dtableInfo.entries.get(node.item.shape) ?? null,
        npcPreviews[index],
        itemPreviews[index]
      )
    );
    const sprites = [...spriteMap.values()].map((sprite) => serializeSprite(sprite, packed.placements.get(sprite.id)));
    const shapeDefinitions = [...shapeDefinitionMap.values()].sort((left, right) => left.shape - right.shape);
    const sceneSummary = summarizeSceneItems(items);

    const scene = {
      build: {
        version: SCENE_CACHE_VERSION,
        fingerprint,
        generatedAt: nowIso(),
        cacheMode: "single-scene"
      },
      metadata: {
        game: gameConfig.id,
        gameLabel: gameConfig.label,
        map: mapId,
        rawItemCount: baseItems.length,
        itemCount: renderItems.length,
        paintedItemCount: items.length,
        occludedItemCount: sorted.occludedCount,
        invalidItemCount: sorted.invalidItemCount,
        invalidItems: sorted.invalidItems,
        sceneSummary: {
          atlasCount: atlasFiles.length,
          spriteCount: sprites.length,
          helperCount: sceneSummary.helperCount,
          kindCounts: sceneSummary.kindCounts,
          sourceCounts: sceneSummary.sourceCounts,
          topFamilies: sceneSummary.topFamilies
        },
        usage: makeUsageInfo(gameConfig.id, mapId, baseItems, renderItems),
        baseItemSummary: summarizeRenderClasses(baseItems, assets.shapeInfos),
        sorter: "scummvm_dependency_graph",
        isEmpty: false,
        emptyReason: null,
        bounds: {
          screenLeft: sorted.minLeft,
          screenTop: sorted.minTop,
          screenRight: sorted.maxRight,
          screenBottom: sorted.maxBottom,
          width: sorted.maxRight - sorted.minLeft,
          height: sorted.maxBottom - sorted.minTop
        },
        zoom: {
          min: 0.01,
          max: 8,
          step: 0.1,
          initial: 1
        },
        buildFingerprint: fingerprint,
        generatedAt: nowIso()
      },
      atlases: atlasFiles.map((atlas) => ({
        id: atlas.id,
        fileName: atlas.fileName,
        width: atlas.width,
        height: atlas.height
      })),
      sprites,
      shapeDefinitions,
      items,
      mapSource
    };

    fs.writeFileSync(sceneFilePath, JSON.stringify(scene, null, 2));
    return {
      ...scene,
      cacheDir,
      sceneFilePath,
      atlasFiles
    };
  }

  touchJob(job, message) {
    job.updatedAt = nowIso();
    job.progress.push({
      at: job.updatedAt,
      phase: job.phase,
      message
    });
    if (job.progress.length > 120) {
      job.progress.splice(0, job.progress.length - 120);
    }
  }

  getPublicJob(job) {
    return {
      id: job.id,
      game: job.game,
      mapId: job.mapId,
      options: {
        includeEditor: true,
        includeRoofs: true,
        cacheMode: "single-scene"
      },
      fingerprint: job.fingerprint,
      status: job.status,
      phase: job.phase,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
      metadata: job.status === "ready" ? job.metadata : null,
      progress: job.progress
    };
  }

  getMetadata(jobId, gameId, mapId) {
    return this.requireReadyJob(jobId, gameId, mapId).metadata;
  }

  getSceneData(jobId, gameId, mapId) {
    const job = this.requireReadyJob(jobId, gameId, mapId);
    return {
      build: job.build.build,
      metadata: job.build.metadata,
      atlases: job.build.atlases,
      sprites: job.build.sprites,
      shapeDefinitions: job.build.shapeDefinitions,
      items: job.build.items,
      mapSource: job.build.mapSource
    };
  }

  getInspectData(jobId, gameId, mapId) {
    const job = this.requireReadyJob(jobId, gameId, mapId);
    return {
      shapeDefinitions: job.build.shapeDefinitions,
      items: job.build.items
    };
  }

  getOverlayData(jobId, gameId, mapId) {
    const job = this.requireReadyJob(jobId, gameId, mapId);
    const shapeDefinitions = new Map(job.build.shapeDefinitions.map((definition) => [definition.id, definition]));
    const overlayItems = job.build.items.filter((item) => {
      const definition = shapeDefinitions.get(item.shapeDefId);
      return definition?.traits.editor || definition?.kind === "helper" || definition?.kind === "egg";
    });
    return {
      shapeDefinitions: job.build.shapeDefinitions,
      items: overlayItems,
      summary: summarizeSceneItems(overlayItems)
    };
  }

  getAtlas(jobId, gameId, mapId, atlasId) {
    const job = this.requireReadyJob(jobId, gameId, mapId);
    const atlas = job.build.atlasFiles.find((entry) => entry.id === atlasId);
    if (!atlas || !fs.existsSync(atlas.filePath)) {
      throw new Error("Unknown atlas id");
    }
    return fs.readFileSync(atlas.filePath);
  }

  requireReadyJob(jobId, gameId, mapId) {
    const job = this.getJob(jobId);
    if (!job) {
      throw new Error("Unknown build id");
    }
    if (job.game !== gameId || job.mapId !== mapId) {
      throw new Error("Build id does not match the requested map");
    }
    if (job.status !== "ready") {
      throw new Error("Build is not ready yet");
    }
    return job;
  }
}
