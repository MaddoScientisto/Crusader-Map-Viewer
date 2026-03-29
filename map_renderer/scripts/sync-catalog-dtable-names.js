import { GAMES } from "../src/config.js";
import { syncShapeCatalogWithDtable } from "../src/lib/catalog.js";
import { getShapeNameTableFile } from "../src/lib/dtable.js";

function parseArgs(argv) {
  const parsed = {
    games: [],
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--game=")) {
      parsed.games.push(...arg.slice("--game=".length).split(",").map((value) => value.trim()).filter(Boolean));
    }
  }

  return parsed;
}

function selectGames(requestedGames) {
  if (requestedGames.length) {
    return requestedGames;
  }
  return GAMES.map((game) => game.id).filter((gameId) => Boolean(getShapeNameTableFile(gameId)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const games = selectGames(args.games);
  if (!games.length) {
    throw new Error("No games selected and no dtable-backed catalogs are configured.");
  }

  let hadChanges = false;
  for (const gameId of games) {
    const result = syncShapeCatalogWithDtable(gameId, { dryRun: args.dryRun });
    const mode = result.dryRun ? "dry-run" : "write";
    console.log(
      [
        `${gameId}: ${mode}`,
        `tableEntries=${result.tableEntryCount}`,
        `created=${result.created}`,
        `updated=${result.updated}`,
        `untouched=${result.untouched}`,
        `catalog=${result.filePath}`,
        `table=${result.tableFilePath ?? "missing"}`
      ].join(" | ")
    );
    hadChanges ||= result.changed;
  }

  if (!hadChanges) {
    console.log(args.dryRun ? "No catalog changes would be applied." : "Catalogs already match the configured dtable names.");
  }
}

main();
