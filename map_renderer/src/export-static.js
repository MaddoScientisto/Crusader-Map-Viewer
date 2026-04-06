import fs from "node:fs";
import path from "node:path";

import { generateMissionMapData } from "./generate-mission-map-data.js";
import { STATIC_SITE_ROOT, VUE_DIST_ROOT } from "./config.js";
import { writeNpcSpawnerData } from "./generate-npc-spawner-data.js";
import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig, getShapeCatalogFile } from "./lib/catalog.js";
import {
  buildCompactScenePayload,
  getSceneReferenceId
} from "./lib/scene-reference-data.js";
import { getShapeNameTableFile } from "./lib/dtable.js";

function parseArgs(argv) {
  const parsed = {
    game: null,
    mapId: null,
    outputDir: STATIC_SITE_ROOT
  };

  for (const arg of argv) {
    if (arg.startsWith("--game=")) {
      parsed.game = arg.slice("--game=".length);
      continue;
    }
    if (arg.startsWith("--map=")) {
      parsed.mapId = Number.parseInt(arg.slice("--map=".length), 10);
      continue;
    }
    if (arg.startsWith("--output=")) {
      parsed.outputDir = path.resolve(arg.slice("--output=".length));
      continue;
    }
    if (!parsed.game && Number.isNaN(Number(arg))) {
      parsed.game = arg;
      continue;
    }
    if (!Number.isNaN(Number(arg))) {
      parsed.mapId = Number.parseInt(arg, 10);
    }
  }

  return parsed;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyJson(sourcePath, targetPath) {
  writeJson(targetPath, JSON.parse(fs.readFileSync(sourcePath, "utf8")));
}

function prepareOutputRoot(outputDir) {
  if (!fs.existsSync(path.join(VUE_DIST_ROOT, "index.html"))) {
    throw new Error("Vue production build is missing. Run npm run export-static from the project root, or build the Vue app before calling src/export-static.js directly.");
  }
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.cpSync(VUE_DIST_ROOT, outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, ".nojekyll"), "", "utf8");
  copyFile(path.join(outputDir, "index.html"), path.join(outputDir, "404.html"));
}

function copyCatalogCsvs(games, outputDir) {
  for (const game of games) {
    const catalogPath = getShapeCatalogFile(game.id);
    if (!catalogPath || !fs.existsSync(catalogPath)) {
      continue;
    }
    copyFile(catalogPath, path.join(outputDir, "data", "catalogs", `${game.id}.csv`));
  }
}

function copyShapeNameTables(games, outputDir) {
  for (const game of games) {
    const tablePath = getShapeNameTableFile(game.id);
    if (!tablePath || !fs.existsSync(tablePath)) {
      continue;
    }
    copyJson(tablePath, path.join(outputDir, "data", "tables", `${game.id}-dtable_get_name_dump.json`));
  }
}

function copyUsecodeCache(builds, gameConfig, outputDir) {
  const usecodeCache = builds.ensureUsecodeCache(gameConfig);
  if (!usecodeCache?.cacheRoot || !fs.existsSync(usecodeCache.cacheRoot) || !fs.existsSync(usecodeCache.indexPath)) {
    return null;
  }

  const targetDir = path.join(outputDir, "data", "usecode", gameConfig.id);
  ensureDir(path.dirname(targetDir));
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(usecodeCache.cacheRoot, targetDir, { recursive: true });
  return {
    game: gameConfig.id,
    sourceCount: JSON.parse(fs.readFileSync(usecodeCache.indexPath, "utf8")).sources?.length ?? 0
  };
}

async function exportMap(builds, gameConfig, map, outputDir) {
  const job = await builds.createOrReuseBuild(gameConfig, map.id);
  await job.promise;
  if (job.status !== "ready") {
    throw new Error(`Static export failed for ${gameConfig.id} map ${map.id}: ${job.error ?? "unknown error"}`);
  }

  const build = job.build;
  const referenceId = getSceneReferenceId(gameConfig.id);
  const scenePayload = {
    build: build.build,
    metadata: build.metadata,
    references: build.references,
    items: build.items,
    mapSource: build.mapSource
  };
  const targetDir = path.join(outputDir, "data", "maps", gameConfig.id, `map-${map.id}`);
  ensureDir(targetDir);
  writeJson(path.join(targetDir, "scene.json"), buildCompactScenePayload(scenePayload, referenceId));

  return {
    game: gameConfig.id,
    referenceId,
    mapId: map.id,
    fingerprint: job.fingerprint,
    atlasCount: build.metadata.sceneSummary?.atlasCount ?? 0,
    spriteCount: build.metadata.sceneSummary?.spriteCount ?? 0
  };
}

function copyReferenceDataFiles(builds, referenceIds, outputDir) {
  const summaries = [];

  for (const referenceId of [...new Set(referenceIds)].sort()) {
    const payload = builds.ensureReferenceData(referenceId);
    copyJson(builds.getReferenceDataFilePath(referenceId), path.join(outputDir, "data", "reference-data", `${referenceId}.json`));
    for (const atlas of payload.atlasFiles ?? []) {
      copyFile(atlas.filePath, path.join(outputDir, "data", "reference-atlases", referenceId, atlas.fileName));
    }
    summaries.push({
      id: referenceId,
      sourceGameIds: payload.sourceGameIds,
      shapeDefinitionCount: payload.shapeDefinitionCount,
      spriteCount: payload.spriteCount,
      atlasCount: payload.atlasCount
    });
  }

  return summaries.sort((left, right) => left.id.localeCompare(right.id));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = detectCatalog();
  const builds = new BuildManager(catalog);
  const games = (args.game ? catalog.games.filter((game) => game.id === args.game) : catalog.games)
    .filter((game) => getGameConfig(game.id)?.includeInStaticExport !== false);

  if (!games.length) {
    throw new Error(args.game ? `No detected catalog entry for game ${args.game}` : "No detected maps to export");
  }

  const gameConfigs = games.map((game) => getGameConfig(game.id)).filter(Boolean);
  const missionMapData = generateMissionMapData(gameConfigs);
  const npcSpawnerData = writeNpcSpawnerData(undefined, gameConfigs);

  prepareOutputRoot(args.outputDir);
  copyCatalogCsvs(games, args.outputDir);
  copyShapeNameTables(games, args.outputDir);
  copyJson(missionMapData.outputFile, path.join(args.outputDir, "data", "mission-map-data.json"));
  copyJson(npcSpawnerData.outputFile, path.join(args.outputDir, "data", "npc-spawner-data.json"));

  const exportedMaps = [];
  const exportedUsecode = [];
  const referenceIds = new Set();
  for (const game of games) {
    const gameConfig = getGameConfig(game.id);
    if (!gameConfig) {
      throw new Error(`Missing game config for ${game.id}`);
    }
    const usecodeExport = copyUsecodeCache(builds, gameConfig, args.outputDir);
    if (usecodeExport) {
      exportedUsecode.push(usecodeExport);
    }
    const maps = Number.isInteger(args.mapId) ? game.maps.filter((map) => map.id === args.mapId) : game.maps;
    if (!maps.length) {
      throw new Error(`No detected map ${args.mapId} for game ${game.id}`);
    }

    for (const map of maps) {
      console.log(`exporting ${game.id} map ${map.id}`);
      const exportedMap = await exportMap(builds, gameConfig, map, args.outputDir);
      referenceIds.add(exportedMap.referenceId);
      exportedMaps.push(exportedMap);
    }
  }
  const exportedReferenceData = copyReferenceDataFiles(builds, [...referenceIds], args.outputDir);

  writeJson(path.join(args.outputDir, "site-config.json"), {
    mode: "static",
    catalogUrl: "./data/catalog.json",
    staticMapsBaseUrl: "./data/maps",
    referenceDataBaseUrl: "./data/reference-data",
    referenceAtlasBaseUrl: "./data/reference-atlases",
    staticUsecodeBaseUrl: "./data/usecode",
    catalogDownloadBaseUrl: "./data/catalogs",
    npcSpawnerDataUrl: "./data/npc-spawner-data.json",
    generatedAt: new Date().toISOString(),
    capabilities: {
      reload: false,
      catalogEditing: false
    }
  });

  writeJson(path.join(args.outputDir, "data", "catalog.json"), {
    ...catalog,
    generatedAt: new Date().toISOString(),
    exportedMaps,
    exportedUsecode,
    exportedReferenceData
  });

  console.log(`static site ready at ${args.outputDir}`);
  console.log(`exported ${exportedMaps.length} map(s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});