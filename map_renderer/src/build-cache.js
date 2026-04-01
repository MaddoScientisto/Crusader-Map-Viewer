import fs from "node:fs";
import os from "node:os";
import { isMainThread, parentPort, threadId, workerData, Worker } from "node:worker_threads";

import { CACHE_ROOT } from "./config.js";
import { generateMissionMapData } from "./generate-mission-map-data.js";
import { writeNpcSpawnerData } from "./generate-npc-spawner-data.js";
import { BuildManager } from "./lib/build-manager.js";
import { detectCatalog, getGameConfig } from "./lib/catalog.js";
import { getSceneReferenceId } from "./lib/scene-reference-data.js";

function parseArgs(argv) {
  const parsed = {
    game: null,
    mapId: null,
    threads: 0
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
    if (arg.startsWith("--threads=")) {
      parsed.threads = Number.parseInt(arg.slice("--threads=".length), 10);
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

function groupGamesByReference(games) {
  const groups = new Map();
  for (const game of games) {
    const referenceId = game.referenceId ?? getSceneReferenceId(game.id);
    if (!groups.has(referenceId)) {
      groups.set(referenceId, []);
    }
    groups.get(referenceId).push(game.id);
  }
  return [...groups.entries()]
    .map(([referenceId, sceneGameIds]) => ({ referenceId, sceneGameIds }))
    .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
}

function buildReferenceTasks(games) {
  return groupGamesByReference(games).map(({ referenceId }) => ({
    kind: "reference",
    referenceId
  }));
}

function buildGameTasks(games, mapId) {
  return games
    .map((game) => ({
      kind: "game",
      gameId: game.id,
      mapId: mapId ?? null
    }))
    .sort((left, right) => left.gameId.localeCompare(right.gameId));
}

function availableParallelism() {
  return typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
}

function resolveThreadCount(requested, taskCount) {
  if (taskCount <= 1 || requested === -1) {
    return 1;
  }
  if (requested === 0) {
    return Math.max(1, Math.min(availableParallelism(), taskCount));
  }
  if (!Number.isInteger(requested) || requested < -1) {
    throw new Error(`Invalid thread count: ${requested}`);
  }
  return Math.max(1, Math.min(requested, taskCount));
}

function clearCacheRoot() {
  fs.rmSync(CACHE_ROOT, { recursive: true, force: true });
}

function writeLine(message) {
  process.stdout.write(`${message}\n`);
}

function makeTaskLabel(task) {
  return task.kind === "reference" ? `shared ${task.referenceId}` : task.gameId;
}

function emitLog(message) {
  if (isMainThread) {
    writeLine(message);
    return;
  }
  parentPort?.postMessage({
    type: "log",
    message,
    threadId
  });
}

function createReporter(task) {
  const baseLabel = makeTaskLabel(task);
  const lastProgressByScope = new Map();

  return {
    log(message) {
      emitLog(message);
    },
    progress(scope, phase, message) {
      const scopedLabel = scope ? `${baseLabel} ${scope}` : baseLabel;
      const key = `${phase}:${message}`;
      if (lastProgressByScope.get(scopedLabel) === key) {
        return;
      }
      lastProgressByScope.set(scopedLabel, key);
      emitLog(`progress ${scopedLabel} phase=${phase} ${message}`);
    }
  };
}

function getBuildContext() {
  const catalog = detectCatalog();
  return {
    catalog,
    builds: new BuildManager(catalog)
  };
}

async function warmReferenceTask(task, reporter) {
  const { builds } = getBuildContext();
  const detectedGames = builds.listReferenceGames(task.referenceId).map((game) => getGameConfig(game.id)).filter(Boolean);
  if (!detectedGames.length) {
    throw new Error(`No detected game configs for ${task.referenceId}`);
  }

  reporter.log(`warming shared ${task.referenceId} reference data`);
  const referenceData = builds.ensureReferenceData(task.referenceId, [], [], {
    progress: (phase, message) => reporter.progress("", phase, message)
  });
  reporter.log(
    `ready shared ${task.referenceId} sprites=${referenceData.spriteCount} atlases=${referenceData.atlasCount} definitions=${referenceData.shapeDefinitionCount}`
  );
}

async function warmGameTask(task, reporter) {
  const { catalog, builds } = getBuildContext();
  const game = catalog.games.find((entry) => entry.id === task.gameId);
  const gameConfig = getGameConfig(task.gameId);
  if (!game || !gameConfig) {
    throw new Error(`Missing detected game or config for ${task.gameId}`);
  }

  reporter.log(`warming ${task.gameId} usecode`);
  const usecodeCache = builds.ensureUsecodeCache(gameConfig);
  if (usecodeCache?.indexPath) {
    reporter.log(`ready ${task.gameId} usecode index=${usecodeCache.indexPath}`);
  } else {
    reporter.log(`skipping ${task.gameId} usecode (no source files found)`);
  }

  const maps = Number.isInteger(task.mapId) ? game.maps.filter((map) => map.id === task.mapId) : game.maps;
  if (!maps.length) {
    throw new Error(`No detected map ${task.mapId} for game ${task.gameId}`);
  }

  for (const map of maps) {
    const mapLabel = `map ${map.id}`;
    const fullLabel = `${task.gameId} ${mapLabel}`;
    reporter.log(`warming ${fullLabel}`);
    const job = await builds.createOrReuseBuild(gameConfig, map.id, {}, {
      progress: (phase, message) => reporter.progress(mapLabel, phase, message)
    });
    await job.promise;
    if (job.status !== "ready") {
      throw new Error(`Cache build failed for ${fullLabel}: ${job.error ?? "unknown error"}`);
    }
    reporter.log(`ready ${fullLabel} fingerprint=${job.fingerprint} atlases=${job.metadata.sceneSummary.atlasCount}`);
  }
}

async function runTask(task) {
  const reporter = createReporter(task);
  if (task.kind === "reference") {
    await warmReferenceTask(task, reporter);
    return;
  }
  if (task.kind === "game") {
    await warmGameTask(task, reporter);
    return;
  }
  throw new Error(`Unknown task kind: ${task.kind}`);
}

async function runThreadedTasks(tasks, threadCount) {
  if (!tasks.length) {
    return;
  }

  const queue = [...tasks];
  const workers = [];

  for (let index = 0; index < threadCount; index += 1) {
    workers.push(new Promise((resolve, reject) => {
      const runNext = () => {
        const task = queue.shift();
        if (!task) {
          resolve();
          return;
        }

        const worker = new Worker(new URL(import.meta.url), {
          workerData: task
        });
        worker.on("message", (event) => {
          if (event?.type === "log" && typeof event.message === "string") {
            writeLine(event.message);
          }
        });
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Worker for ${makeTaskLabel(task)} exited with code ${code}`));
            return;
          }
          runNext();
        });
      };

      runNext();
    }));
  }

  await Promise.all(workers);
}

async function mainThread() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = detectCatalog();
  const games = args.game ? catalog.games.filter((game) => game.id === args.game) : catalog.games;

  if (!games.length) {
    throw new Error(args.game ? `No detected catalog entry for game ${args.game}` : "No detected maps to cache");
  }

  if (!args.game && !Number.isInteger(args.mapId)) {
    clearCacheRoot();
  }

  const gameConfigs = games.map((game) => getGameConfig(game.id)).filter(Boolean);
  generateMissionMapData(gameConfigs);
  writeNpcSpawnerData(undefined, gameConfigs);

  const referenceTasks = buildReferenceTasks(games);
  const gameTasks = buildGameTasks(games, args.mapId);
  const threadCount = resolveThreadCount(args.threads, Math.max(referenceTasks.length, gameTasks.length));
  writeLine(`threads=${threadCount}`);

  if (threadCount <= 1) {
    for (const task of referenceTasks) {
      await runTask(task);
    }
    for (const task of gameTasks) {
      await runTask(task);
    }
    return;
  }

  await runThreadedTasks(referenceTasks, Math.min(threadCount, referenceTasks.length));
  await runThreadedTasks(gameTasks, Math.min(threadCount, gameTasks.length));
}

if (!isMainThread) {
  runTask(workerData).catch((error) => {
    emitLog(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  mainThread().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
