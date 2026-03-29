import fs from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { APP_ROOT } from "./config.js";
import { getGameConfig } from "./lib/catalog.js";
import { getMapSummaries, resolveStaticFile } from "./lib/formats.js";
import {
  buildMapSource,
  encodeMapItems,
  loadMapPayload,
  parseMapItemsBuffer,
  readFixedArchive,
  rebuildFixedArchiveBuffer
} from "./lib/map-source.js";

const DEFAULT_MODE = "json";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mapFolderName(mapId) {
  return `map-${mapId}`;
}

function defaultRoot(gameId) {
  return path.join(APP_ROOT, "generated", "map-compiler", gameId);
}

function defaultSplitDir(gameId) {
  return path.join(defaultRoot(gameId), "split");
}

function defaultRebuildDir(gameId) {
  return path.join(defaultRoot(gameId), "rebuilt");
}

function printUsage() {
  console.log(`Crusader map compiler

Usage:
  npm run map-compiler -- split --game=<remorse|regret> [--fixed=<path>] [--output=<dir>]
  npm run map-compiler -- rebuild --game=<remorse|regret> [--from=json|binary] [--fixed=<path>] [--input=<split-dir>] [--output=<dir>]
  npm run map-compiler -- help

Without parameters the script starts an interactive console mode.`);
}

function parseArgs(argv) {
  const args = {
    command: null,
    game: null,
    fixedPath: null,
    inputDir: null,
    outputDir: null,
    from: DEFAULT_MODE,
    help: false
  };

  for (const arg of argv) {
    if (["split", "rebuild", "help"].includes(arg) && !args.command) {
      args.command = arg;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg.startsWith("--game=")) {
      args.game = arg.slice("--game=".length);
      continue;
    }
    if (arg.startsWith("--fixed=")) {
      args.fixedPath = path.resolve(arg.slice("--fixed=".length));
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.inputDir = path.resolve(arg.slice("--input=".length));
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.outputDir = path.resolve(arg.slice("--output=".length));
      continue;
    }
    if (arg.startsWith("--from=")) {
      args.from = arg.slice("--from=".length).toLowerCase();
      continue;
    }
  }

  if (!args.game && process.env.npm_config_game) {
    args.game = process.env.npm_config_game;
  }
  if (!args.fixedPath && process.env.npm_config_fixed) {
    args.fixedPath = path.resolve(process.env.npm_config_fixed);
  }
  if (!args.inputDir && process.env.npm_config_input) {
    args.inputDir = path.resolve(process.env.npm_config_input);
  }
  if (!args.outputDir && process.env.npm_config_output) {
    args.outputDir = path.resolve(process.env.npm_config_output);
  }
  if (args.from === DEFAULT_MODE && process.env.npm_config_from) {
    args.from = process.env.npm_config_from.toLowerCase();
  }

  return args;
}

function requireGameConfig(gameId) {
  const gameConfig = getGameConfig(gameId);
  if (!gameConfig) {
    throw new Error(`Unknown game id: ${gameId}`);
  }
  return gameConfig;
}

function resolveFixedPath(gameConfig, overridePath) {
  return overridePath ? path.resolve(overridePath) : resolveStaticFile(gameConfig.staticDir, "FIXED.DAT");
}

function validateRebuildMode(mode) {
  if (!["json", "binary"].includes(mode)) {
    throw new Error(`Unsupported rebuild mode: ${mode}`);
  }
}

async function promptInteractive() {
  const rl = createInterface({ input, output });
  try {
    const commandAnswer = (await rl.question("Action ([1] split, [2] rebuild): ")).trim();
    const command = commandAnswer === "2" ? "rebuild" : "split";
    const gameAnswer = (await rl.question("Game ([1] remorse, [2] regret): ")).trim();
    const game = gameAnswer === "2" ? "regret" : "remorse";
    const fixedOverride = (await rl.question("Original FIXED.DAT path (leave blank for default): ")).trim();

    if (command === "split") {
      const outputOverride = (await rl.question(`Split output directory (default: ${defaultSplitDir(game)}): `)).trim();
      return {
        command,
        game,
        fixedPath: fixedOverride || null,
        outputDir: outputOverride || null,
        inputDir: null,
        from: DEFAULT_MODE,
        help: false
      };
    }

    const modeAnswer = (await rl.question("Rebuild source ([1] json, [2] binary): ")).trim();
    const from = modeAnswer === "2" ? "binary" : "json";
    const inputOverride = (await rl.question(`Split input directory (default: ${defaultSplitDir(game)}): `)).trim();
    const outputOverride = (await rl.question(`Rebuild output directory (default: ${defaultRebuildDir(game)}): `)).trim();
    return {
      command,
      game,
      fixedPath: fixedOverride || null,
      inputDir: inputOverride || null,
      outputDir: outputOverride || null,
      from,
      help: false
    };
  } finally {
    rl.close();
  }
}

function splitMaps({ gameId, fixedPath, outputDir }) {
  const maps = getMapSummaries(fixedPath).filter((map) => map.isValid);
  ensureDir(outputDir);

  for (const map of maps) {
    const payload = loadMapPayload(fixedPath, map.id);
    const items = parseMapItemsBuffer(payload, "fixed");
    const mapDir = path.join(outputDir, mapFolderName(map.id));
    ensureDir(mapDir);
    fs.writeFileSync(path.join(mapDir, "map.bin"), payload);
    writeJson(
      path.join(mapDir, "map.json"),
      {
        ...buildMapSource(gameId, map.id, items, null, payload.length),
        originalOffset: map.offset,
        originalSize: map.byteSize
      }
    );
  }

  writeJson(path.join(outputDir, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    game: gameId,
    fixedPath,
    mapCount: maps.length,
    outputDir
  });

  console.log(`split ${maps.length} map(s) to ${outputDir}`);
}

function loadRebuildPayload(mapDir, fromMode) {
  if (fromMode === "binary") {
    const filePath = path.join(mapDir, "map.bin");
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  }

  const filePath = path.join(mapDir, "map.json");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const parsed = readJson(filePath);
  if (!Array.isArray(parsed.items)) {
    throw new Error(`Map JSON is missing an items array: ${filePath}`);
  }
  return encodeMapItems(parsed.items);
}

function rebuildMaps({ fixedPath, inputDir, outputDir, fromMode }) {
  validateRebuildMode(fromMode);
  const sourceData = readFixedArchive(fixedPath);
  const maps = getMapSummaries(fixedPath).filter((map) => map.isValid);
  const payloads = new Map();
  const replacedMaps = [];

  for (const map of maps) {
    const mapDir = path.join(inputDir, mapFolderName(map.id));
    if (!fs.existsSync(mapDir)) {
      continue;
    }
    const payload = loadRebuildPayload(mapDir, fromMode);
    if (!payload) {
      continue;
    }
    payloads.set(map.id, payload);
    replacedMaps.push(map.id);
  }

  ensureDir(outputDir);
  const outputPath = path.join(outputDir, "FIXED.DAT");
  if (path.resolve(outputPath) === path.resolve(fixedPath)) {
    throw new Error("Refusing to overwrite the original FIXED.DAT. Choose a different output directory.");
  }

  fs.writeFileSync(outputPath, rebuildFixedArchiveBuffer(sourceData, payloads));
  writeJson(path.join(outputDir, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    fixedPath,
    inputDir,
    outputPath,
    from: fromMode,
    replacedMaps
  });

  console.log(`rebuilt FIXED.DAT at ${outputPath}`);
  console.log(`updated ${replacedMaps.length} map(s) from ${fromMode}`);
}

async function main() {
  const parsed = process.argv.length <= 2 ? await promptInteractive() : parseArgs(process.argv.slice(2));
  if (parsed.help || parsed.command === "help") {
    printUsage();
    return;
  }
  if (!parsed.command) {
    printUsage();
    return;
  }
  if (!parsed.game) {
    throw new Error("A game id is required. Use --game=remorse or --game=regret.");
  }

  const gameConfig = requireGameConfig(parsed.game);
  const fixedPath = resolveFixedPath(gameConfig, parsed.fixedPath);
  if (!fs.existsSync(fixedPath)) {
    throw new Error(`FIXED.DAT not found: ${fixedPath}`);
  }

  if (parsed.command === "split") {
    splitMaps({
      gameId: gameConfig.id,
      fixedPath,
      outputDir: parsed.outputDir ?? defaultSplitDir(gameConfig.id)
    });
    return;
  }

  rebuildMaps({
    fixedPath,
    inputDir: parsed.inputDir ?? defaultSplitDir(gameConfig.id),
    outputDir: parsed.outputDir ?? defaultRebuildDir(gameConfig.id),
    fromMode: parsed.from ?? DEFAULT_MODE
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});