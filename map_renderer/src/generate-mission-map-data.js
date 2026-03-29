import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MISSION_MAP_CACHE_FILE } from "./config.js";
import { writeMissionMapData } from "./lib/mission-map-data.js";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const parsed = {
    outputFile: MISSION_MAP_CACHE_FILE
  };

  for (const arg of argv) {
    if (arg.startsWith("--output=")) {
      parsed.outputFile = path.resolve(arg.slice("--output=".length));
    }
  }

  return parsed;
}

export function generateMissionMapData(outputFile = MISSION_MAP_CACHE_FILE) {
  return writeMissionMapData(outputFile);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { outputFile, gameTablesById, payload } = generateMissionMapData(args.outputFile);

  console.log(`wrote ${outputFile}`);
  console.log(`sharedBaseMapSequence=${payload.sharedBaseMapSequence}`);
  for (const [gameId, table] of Object.entries(gameTablesById)) {
    console.log(
      `${gameId}: ${table.entryCount} entries @ ${table.tableAddress} -> ${table.baseMaps.join(", ")}`
    );
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && path.resolve(process.argv[1]) === __filename) {
  main();
}