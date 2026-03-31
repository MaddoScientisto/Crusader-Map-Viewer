import fs from "node:fs";
import path from "node:path";

import { generateMissionMapData } from "./generate-mission-map-data.js";
import { STATIC_SITE_ROOT, VUE_DIST_ROOT } from "./config.js";
import { writeNpcSpawnerData } from "./generate-npc-spawner-data.js";
import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig, getShapeCatalogFile } from "./lib/catalog.js";
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function prepareOutputRoot(outputDir) {
  if (!fs.existsSync(path.join(VUE_DIST_ROOT, "index.html"))) {
    throw new Error("Vue production build is missing. Run npm run build:vue before export-static.");
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
    copyFile(tablePath, path.join(outputDir, "data", "tables", `${game.id}-dtable_get_name_dump.json`));
  }
}

async function exportMap(builds, gameConfig, map, outputDir) {
  const job = await builds.createOrReuseBuild(gameConfig, map.id);
  await job.promise;
  if (job.status !== "ready") {
    throw new Error(`Static export failed for ${gameConfig.id} map ${map.id}: ${job.error ?? "unknown error"}`);
  }

  const build = job.build;
  const targetDir = path.join(outputDir, "data", "maps", gameConfig.id, `map-${map.id}`);
  ensureDir(targetDir);
  copyFile(build.sceneFilePath, path.join(targetDir, "scene.json"));
  for (const atlas of build.atlasFiles) {
    copyFile(atlas.filePath, path.join(targetDir, atlas.fileName));
  }

  return {
    game: gameConfig.id,
    mapId: map.id,
    fingerprint: job.fingerprint,
    atlasCount: build.atlasFiles.length,
    spriteCount: build.metadata.sceneSummary?.spriteCount ?? 0
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = detectCatalog();
  const builds = new BuildManager(catalog);
  const games = args.game ? catalog.games.filter((game) => game.id === args.game) : catalog.games;

  if (!games.length) {
    throw new Error(args.game ? `No detected catalog entry for game ${args.game}` : "No detected maps to export");
  }

  const gameConfigs = games.map((game) => getGameConfig(game.id)).filter(Boolean);
  const missionMapData = generateMissionMapData(gameConfigs);
  const npcSpawnerData = writeNpcSpawnerData(undefined, gameConfigs);

  prepareOutputRoot(args.outputDir);
  copyCatalogCsvs(games, args.outputDir);
  copyShapeNameTables(games, args.outputDir);
  copyFile(missionMapData.outputFile, path.join(args.outputDir, "data", "mission-map-data.json"));
  copyFile(npcSpawnerData.outputFile, path.join(args.outputDir, "data", "npc-spawner-data.json"));

  const exportedMaps = [];
  for (const game of games) {
    const gameConfig = getGameConfig(game.id);
    if (!gameConfig) {
      throw new Error(`Missing game config for ${game.id}`);
    }
    const maps = Number.isInteger(args.mapId) ? game.maps.filter((map) => map.id === args.mapId) : game.maps;
    if (!maps.length) {
      throw new Error(`No detected map ${args.mapId} for game ${game.id}`);
    }

    for (const map of maps) {
      console.log(`exporting ${game.id} map ${map.id}`);
      exportedMaps.push(await exportMap(builds, gameConfig, map, args.outputDir));
    }
  }

  writeJson(path.join(args.outputDir, "site-config.json"), {
    mode: "static",
    catalogUrl: "./data/catalog.json",
    staticMapsBaseUrl: "./data/maps",
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
    exportedMaps
  });

  console.log(`static site ready at ${args.outputDir}`);
  console.log(`exported ${exportedMaps.length} map(s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});