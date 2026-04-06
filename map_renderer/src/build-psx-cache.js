import { GAMES } from "./config.js";
import { buildPsxTypeProbeCache } from "./lib/psx-cache.js";

function parseArgs(argv) {
  const parsed = {
    mapId: null
  };

  for (const arg of argv) {
    if (arg.startsWith("--map=")) {
      parsed.mapId = Number.parseInt(arg.slice("--map=".length), 10);
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
  const gameConfig = GAMES.find((game) => game.id === "psx-remorse");
  if (!gameConfig) {
    throw new Error("Missing psx-remorse game config");
  }

  const result = buildPsxTypeProbeCache(gameConfig, {
    mapId: Number.isInteger(args.mapId) ? args.mapId : null
  });

  console.log(`wrote PSX cache catalog: ${result.catalogFile}`);
  console.log(`wrote PSX reference data: ${result.referenceDataFile}`);
  console.log(`maps: ${result.mapCount} atlases: ${result.atlasCount} shapeDefinitions: ${result.shapeDefinitionCount}`);
  for (const map of result.maps.slice(0, 12)) {
    console.log(`map ${map.id}: ${map.label} items=${map.rawItemCount} fingerprint=${map.fingerprint}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});