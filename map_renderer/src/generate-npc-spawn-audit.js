import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_ROOT,
  CACHE_ROOT,
  GAMES,
  SCENE_CACHE_ROOT
} from "./config.js";
import { collectNpcSpawnerRows, resolveDtablePath } from "./generate-npc-spawner-data.js";

const __filename = fileURLToPath(import.meta.url);

const MONSTER_SPAWNER_SHAPE_DEF_ID = `shape:${0x04d0}`;
const MONSTER_EGG_SHAPE_DEF_ID = `shape:${0x024f}`;
const MONSTER_SPAWNER_PAIR_MAX_DISTANCE = 512;
const NPC_SPAWN_AUDIT_CACHE_FILE = path.join(CACHE_ROOT, "npc-spawn-audit.generated.json");
const NPC_SPAWN_AUDIT_DOC_FILE = path.join(APP_ROOT, "docs", "npc-spawn-audit.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadNpcRowsByGame(games = GAMES) {
  return Object.fromEntries(
    Object.entries(collectNpcSpawnerRows(games)).map(([gameId, rows]) => [
      gameId,
      Object.fromEntries(rows.map((row) => [String(row.index), { name: row.name, shape: row.shape }]))
    ])
  );
}

function getFixedSceneItemId(item) {
  if (item?.source === "fixed" && Number.isInteger(item?.mapSourceIndex)) {
    return `fixed:${item.mapSourceIndex}`;
  }
  return null;
}

function getSignalKey(item) {
  return Number.isInteger(item?.quality) ? (item.quality & 0xff) : null;
}

function distance(left, right) {
  return Math.hypot((left?.world?.x ?? 0) - (right?.world?.x ?? 0), (left?.world?.y ?? 0) - (right?.world?.y ?? 0));
}

function isMonsterSpawnerAutoEnabled(item) {
  return (((item?.mapNum ?? 0) & 0x08) === 0);
}

function getNpcRow(npcRowsById, npcNum) {
  if (!Number.isInteger(npcNum)) {
    return null;
  }
  return npcRowsById[String(npcNum)] ?? null;
}

function listSceneFilesForGame(gameId) {
  const gameRoot = path.join(SCENE_CACHE_ROOT, gameId);
  if (!fs.existsSync(gameRoot)) {
    return [];
  }

  const mapEntries = fs.readdirSync(gameRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^map-\d+$/u.test(entry.name))
    .sort((left, right) => {
      const leftId = Number.parseInt(left.name.slice(4), 10);
      const rightId = Number.parseInt(right.name.slice(4), 10);
      return leftId - rightId;
    });

  const sceneFiles = [];
  for (const mapEntry of mapEntries) {
    const mapId = Number.parseInt(mapEntry.name.slice(4), 10);
    const mapRoot = path.join(gameRoot, mapEntry.name);
    const variants = fs.readdirSync(mapRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const scenePath = path.join(mapRoot, entry.name, "scene.json");
        if (!fs.existsSync(scenePath)) {
          return null;
        }
        return {
          scenePath,
          mtimeMs: fs.statSync(scenePath).mtimeMs
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    if (!variants.length) {
      continue;
    }

    sceneFiles.push({
      mapId,
      scenePath: variants[0].scenePath
    });
  }

  return sceneFiles;
}

function createPlacementRecord({
  scene,
  sourceType,
  state,
  basis,
  carrier,
  controller,
  npcRow,
  pairDistance = null
}) {
  return {
    mapId: scene.metadata?.map ?? null,
    sourceType,
    state,
    basis,
    npcNum: carrier.npcNum,
    npcName: npcRow?.name ?? `NPC ${carrier.npcNum}`,
    npcShape: Number.isInteger(npcRow?.shape) ? npcRow.shape : null,
    carrierId: getFixedSceneItemId(carrier) ?? carrier.id,
    controllerId: controller ? (getFixedSceneItemId(controller) ?? controller.id) : null,
    carrierFrame: carrier.frame,
    controllerFrame: controller?.frame ?? null,
    controllerAutoEnabled: controller ? isMonsterSpawnerAutoEnabled(controller) : null,
    qLo: getSignalKey(controller ?? carrier),
    pairDistance,
    world: carrier.world ?? null
  };
}

function resolveSpawnerPlacements(scene, npcRowsById) {
  const spawners = scene.items.filter((item) => item.shapeDefId === MONSTER_SPAWNER_SHAPE_DEF_ID);
  const placements = [];
  const usedIds = new Set();

  for (const controller of spawners) {
    if (controller.frame !== 0) {
      continue;
    }

    const qLo = getSignalKey(controller);
    const pairCandidates = spawners
      .filter((candidate) => candidate.id !== controller.id && candidate.frame === 1 && getSignalKey(candidate) === qLo && distance(controller, candidate) <= MONSTER_SPAWNER_PAIR_MAX_DISTANCE)
      .sort((left, right) => distance(controller, left) - distance(controller, right));
    const pair = pairCandidates[0] ?? null;
    const pairRow = pair ? getNpcRow(npcRowsById, pair.npcNum) : null;
    const controllerRow = getNpcRow(npcRowsById, controller.npcNum);
    const carrier = pairRow ? pair : controllerRow ? controller : null;
    const carrierRow = pairRow ?? controllerRow;

    if (!carrier || !carrierRow) {
      continue;
    }

    usedIds.add(controller.id);
    if (pair && carrier.id === pair.id) {
      usedIds.add(pair.id);
    }

    placements.push(createPlacementRecord({
      scene,
      sourceType: "0x04d0",
      state: isMonsterSpawnerAutoEnabled(controller) ? "auto-enabled" : "auto-disabled",
      basis: carrier.id === controller.id ? "frame0-self" : (isMonsterSpawnerAutoEnabled(controller) ? "paired-frame1-auto" : "paired-frame1-blocked"),
      carrier,
      controller,
      npcRow: carrierRow,
      pairDistance: pair ? Math.round(distance(controller, pair)) : null
    }));
  }

  for (const item of spawners) {
    if (usedIds.has(item.id) || item.frame !== 1) {
      continue;
    }

    const npcRow = getNpcRow(npcRowsById, item.npcNum);
    if (!npcRow) {
      continue;
    }

    placements.push(createPlacementRecord({
      scene,
      sourceType: "0x04d0",
      state: "signaled-only",
      basis: "unpaired-frame1",
      carrier: item,
      controller: null,
      npcRow
    }));
  }

  return placements;
}

function resolveMonsterEggPlacements(scene, npcRowsById) {
  return scene.items
    .filter((item) => item.shapeDefId === MONSTER_EGG_SHAPE_DEF_ID && item.frame === 0 && item.egg?.type === "monster-spawn")
    .map((item) => {
      const npcRow = getNpcRow(npcRowsById, item.npcNum);
      if (!npcRow) {
        return null;
      }

      return createPlacementRecord({
        scene,
        sourceType: "0x024f-egg",
        state: "monster-egg",
        basis: "monster-egg-frame0",
        carrier: item,
        controller: null,
        npcRow
      });
    })
    .filter(Boolean);
}

function toWorldPoint(world) {
  if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(world.z)) {
    return null;
  }

  return {
    x: world.x,
    y: world.y,
    z: world.z
  };
}

function buildWarpString(mapId, world) {
  const point = toWorldPoint(world);
  if (!Number.isInteger(mapId) || !point) {
    return null;
  }

  const diskX = Math.trunc(point.x / 2);
  const diskY = Math.trunc(point.y / 2);
  return `-warp 0 ${diskX} ${diskY} ${point.z} -mapoff ${mapId}`;
}

function groupPlacementsByMap(placements) {
  const grouped = new Map();
  for (const placement of placements) {
    if (!Number.isInteger(placement.mapId)) {
      continue;
    }
    if (!grouped.has(placement.mapId)) {
      grouped.set(placement.mapId, []);
    }
    grouped.get(placement.mapId).push(placement);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([mapId, mapPlacements]) => ({
      mapId,
      count: mapPlacements.length,
      carrierIds: [...new Set(mapPlacements.map((placement) => placement.carrierId).filter(Boolean))].sort(),
      controllerIds: [...new Set(mapPlacements.map((placement) => placement.controllerId).filter(Boolean))].sort(),
      bases: [...new Set(mapPlacements.map((placement) => placement.basis))].sort(),
      sightings: mapPlacements
        .map((placement) => ({
          carrierId: placement.carrierId,
          controllerId: placement.controllerId,
          basis: placement.basis,
          sourceType: placement.sourceType,
          qLo: placement.qLo,
          pairDistance: placement.pairDistance,
          world: toWorldPoint(placement.world),
          warpString: buildWarpString(mapId, placement.world)
        }))
        .sort((left, right) => {
          const leftId = String(left.carrierId ?? "");
          const rightId = String(right.carrierId ?? "");
          return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: "base" });
        })
    }));
}

function summarizeNpcPlacements(game, npcRowsById) {
  const npcEntries = new Map(
    Object.entries(npcRowsById).map(([npcNum, row]) => [Number.parseInt(npcNum, 10), {
      npcNum: Number.parseInt(npcNum, 10),
      name: row.name,
      shape: row.shape,
      placements: []
    }])
  );

  const sceneFiles = listSceneFilesForGame(game.id);
  for (const { scenePath } of sceneFiles) {
    const scene = readJson(scenePath);
    const placements = [
      ...resolveSpawnerPlacements(scene, npcRowsById),
      ...resolveMonsterEggPlacements(scene, npcRowsById)
    ];

    for (const placement of placements) {
      if (!npcEntries.has(placement.npcNum)) {
        npcEntries.set(placement.npcNum, {
          npcNum: placement.npcNum,
          name: placement.npcName,
          shape: placement.npcShape,
          placements: []
        });
      }
      npcEntries.get(placement.npcNum).placements.push(placement);
    }
  }

  const npcs = [...npcEntries.values()]
    .sort((left, right) => left.npcNum - right.npcNum)
    .map((entry) => {
      const byState = {
        autoEnabled: entry.placements.filter((placement) => placement.state === "auto-enabled"),
        autoDisabled: entry.placements.filter((placement) => placement.state === "auto-disabled"),
        signaledOnly: entry.placements.filter((placement) => placement.state === "signaled-only"),
        monsterEgg: entry.placements.filter((placement) => placement.state === "monster-egg")
      };
      return {
        npcNum: entry.npcNum,
        name: entry.name,
        shape: entry.shape,
        totalPlacements: entry.placements.length,
        activeCount: byState.autoEnabled.length,
        disabledCount: byState.autoDisabled.length,
        signaledOnlyCount: byState.signaledOnly.length,
        eggCount: byState.monsterEgg.length,
        appearsInMaps: [...new Set(entry.placements.map((placement) => placement.mapId).filter(Number.isInteger))].sort((left, right) => left - right),
        mapLists: {
          autoEnabled: [...new Set(byState.autoEnabled.map((placement) => placement.mapId).filter(Number.isInteger))].sort((left, right) => left - right),
          autoDisabled: [...new Set(byState.autoDisabled.map((placement) => placement.mapId).filter(Number.isInteger))].sort((left, right) => left - right),
          signaledOnly: [...new Set(byState.signaledOnly.map((placement) => placement.mapId).filter(Number.isInteger))].sort((left, right) => left - right),
          monsterEgg: [...new Set(byState.monsterEgg.map((placement) => placement.mapId).filter(Number.isInteger))].sort((left, right) => left - right)
        },
        placementsByState: {
          autoEnabled: groupPlacementsByMap(byState.autoEnabled),
          autoDisabled: groupPlacementsByMap(byState.autoDisabled),
          signaledOnly: groupPlacementsByMap(byState.signaledOnly),
          monsterEgg: groupPlacementsByMap(byState.monsterEgg)
        }
      };
    });

  return {
    gameId: game.id,
    label: game.label,
    versionLabel: game.versionLabel,
    dtablePath: resolveDtablePath(game.staticDir),
    scannedMapCount: sceneFiles.length,
    scannedMaps: sceneFiles.map((entry) => entry.mapId),
    npcCount: npcs.length,
    usedNpcCount: npcs.filter((npc) => npc.totalPlacements > 0).length,
    unusedNpcCount: npcs.filter((npc) => npc.totalPlacements === 0).length,
    autoEnabledNpcCount: npcs.filter((npc) => npc.activeCount > 0).length,
    autoDisabledNpcCount: npcs.filter((npc) => npc.disabledCount > 0).length,
    monsterEggNpcCount: npcs.filter((npc) => npc.eggCount > 0).length,
    npcs
  };
}

function formatFlatMapList(mapIds) {
  if (!mapIds.length) {
    return "none";
  }

  return mapIds.join(" ");
}

function renderVersionAudit(audit) {
  const lines = [
    `## ${audit.label}`,
    "",
    "```text"
  ];

  for (const npc of audit.npcs) {
    lines.push(`${npc.name || `NPC ${npc.npcNum}`}: ${formatFlatMapList(npc.appearsInMaps)}`);
  }

  lines.push("```");

  return lines.join("\n");
}

function renderMarkdownReport(versionAudits) {
  const lines = [
    "# NPC Spawn Audit",
    "",
    "NPC names are read directly from each version's `DTABLE.FLX`. Maps are deduplicated and sorted; `none` means the row exists in that version but did not appear in the cached scene exports.",
    ""
  ];

  for (const audit of versionAudits) {
    lines.push(renderVersionAudit(audit), "");
  }

  return lines.join("\n").trim();
}

export function generateNpcSpawnAudit(games = GAMES) {
  const npcRowsByGame = loadNpcRowsByGame(games);
  const versionAudits = games
    .filter((game) => npcRowsByGame[game.id])
    .map((game) => summarizeNpcPlacements(game, npcRowsByGame[game.id]));

  const payload = {
    generatedAt: new Date().toISOString(),
    versions: Object.fromEntries(versionAudits.map((audit) => [audit.gameId, audit]))
  };
  const markdown = renderMarkdownReport(versionAudits);

  return {
    payload,
    markdown,
    versionAudits
  };
}

export function writeNpcSpawnAudit() {
  const { payload, markdown, versionAudits } = generateNpcSpawnAudit();
  fs.mkdirSync(path.dirname(NPC_SPAWN_AUDIT_CACHE_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(NPC_SPAWN_AUDIT_DOC_FILE), { recursive: true });
  fs.writeFileSync(NPC_SPAWN_AUDIT_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(NPC_SPAWN_AUDIT_DOC_FILE, `${markdown}\n`, "utf8");

  return {
    cacheFile: NPC_SPAWN_AUDIT_CACHE_FILE,
    docFile: NPC_SPAWN_AUDIT_DOC_FILE,
    versionAudits
  };
}

function main() {
  const { cacheFile, docFile, versionAudits } = writeNpcSpawnAudit();
  console.log(`wrote ${cacheFile}`);
  console.log(`wrote ${docFile}`);
  for (const audit of versionAudits) {
    console.log(`${audit.gameId}: maps=${audit.scannedMapCount} used_rows=${audit.usedNpcCount} unused_rows=${audit.unusedNpcCount}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}