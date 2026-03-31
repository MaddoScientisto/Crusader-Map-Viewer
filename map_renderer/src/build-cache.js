import { generateMissionMapData } from "./generate-mission-map-data.js";
import { writeNpcSpawnerData } from "./generate-npc-spawner-data.js";
import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig } from "./lib/catalog.js";

function parseArgs(argv) {
  const parsed = {
    game: null,
    mapId: null
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = detectCatalog();
  const builds = new BuildManager(catalog);
  const games = args.game ? catalog.games.filter((game) => game.id === args.game) : catalog.games;

  if (!games.length) {
    throw new Error(args.game ? `No detected catalog entry for game ${args.game}` : "No detected maps to cache");
  }

  const gameConfigs = games.map((game) => getGameConfig(game.id)).filter(Boolean);
  generateMissionMapData(gameConfigs);
  writeNpcSpawnerData(undefined, gameConfigs);

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
      const label = `${game.id} map ${map.id}`;
      console.log(`warming ${label}`);
      const job = await builds.createOrReuseBuild(gameConfig, map.id);
      await job.promise;
      if (job.status !== "ready") {
        throw new Error(`Cache build failed for ${label}: ${job.error ?? "unknown error"}`);
      }
      console.log(`ready ${label} fingerprint=${job.fingerprint} atlases=${job.metadata.sceneSummary.atlasCount}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});