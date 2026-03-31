import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig } from "./lib/catalog.js";

function parseArgs(argv) {
  const parsed = {
    game: null
  };

  for (const arg of argv) {
    if (arg.startsWith("--game=")) {
      parsed.game = arg.slice("--game=".length);
      continue;
    }
    if (!parsed.game) {
      parsed.game = arg;
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
    throw new Error(args.game ? `No detected catalog entry for game ${args.game}` : "No detected games with usecode sources");
  }

  for (const game of games) {
    const gameConfig = getGameConfig(game.id);
    if (!gameConfig) {
      throw new Error(`Missing game config for ${game.id}`);
    }
    console.log(`warming ${game.id} usecode`);
    const usecodeCache = builds.ensureUsecodeCache(gameConfig);
    if (usecodeCache?.indexPath) {
      console.log(`ready ${game.id} usecode index=${usecodeCache.indexPath}`);
    } else {
      console.log(`skipping ${game.id} usecode (no source files found)`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});