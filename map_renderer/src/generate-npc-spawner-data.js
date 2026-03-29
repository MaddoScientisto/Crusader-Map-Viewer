import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GAMES, NPC_SPAWNER_CACHE_FILE } from "./config.js";
import { buildNpcSpawnerData, extractNpcSpawnerRows } from "./lib/npc-spawner-data.js";

const __filename = fileURLToPath(import.meta.url);

export function resolveDtablePath(staticDir) {
  return path.join(staticDir, "DTABLE.FLX");
}

export function collectNpcSpawnerRows() {
  const gameRowsById = {};

  for (const game of GAMES) {
    const dtablePath = resolveDtablePath(game.staticDir);
    if (!fs.existsSync(dtablePath)) {
      throw new Error(`Missing DTABLE.FLX for ${game.id}: ${dtablePath}`);
    }
    gameRowsById[game.id] = extractNpcSpawnerRows(dtablePath);
  }

  return gameRowsById;
}

export function writeNpcSpawnerData(outputFile = NPC_SPAWNER_CACHE_FILE) {
  const gameRowsById = collectNpcSpawnerRows();
  const payload = buildNpcSpawnerData(gameRowsById);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { outputFile, gameRowsById, payload };
}

function main() {
  const { outputFile, gameRowsById } = writeNpcSpawnerData();

  console.log(`wrote ${outputFile}`);
  for (const [gameId, rows] of Object.entries(gameRowsById)) {
    console.log(`${gameId}: ${rows.length} NPC rows`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}