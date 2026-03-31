import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { APP_ROOT } from "../src/config.js";
import { BuildManager } from "../src/lib/build-manager.js";
import { detectCatalog, getGameConfig } from "../src/lib/catalog.js";

const OUTPUT_DIR = path.join(APP_ROOT, "generated", "version-differences");
const JSON_REPORT_PATH = path.join(OUTPUT_DIR, "family-export-differences.json");
const MARKDOWN_REPORT_PATH = path.join(OUTPUT_DIR, "family-export-differences.md");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function shortHash(value) {
  return value.slice(0, 12);
}

function normalizeUsage(usage) {
  if (!usage) {
    return null;
  }
  const { note, tableAddress, ...rest } = usage;
  return rest;
}

function normalizeScene(scene) {
  return {
    metadata: {
      map: scene.metadata?.map ?? null,
      rawItemCount: scene.metadata?.rawItemCount ?? null,
      itemCount: scene.metadata?.itemCount ?? null,
      paintedItemCount: scene.metadata?.paintedItemCount ?? null,
      occludedItemCount: scene.metadata?.occludedItemCount ?? null,
      invalidItemCount: scene.metadata?.invalidItemCount ?? null,
      invalidItems: scene.metadata?.invalidItems ?? [],
      sceneSummary: scene.metadata?.sceneSummary ?? null,
      usage: normalizeUsage(scene.metadata?.usage ?? null)
    },
    scene: scene.scene ?? null,
    atlases: (scene.atlases ?? []).map((atlas) => ({
      id: atlas.id,
      width: atlas.width,
      height: atlas.height,
      spriteCount: atlas.spriteCount,
      sprites: atlas.sprites ?? []
    }))
  };
}

function readScenePayload(sceneFilePath) {
  const scene = JSON.parse(fs.readFileSync(sceneFilePath, "utf8"));
  const normalized = normalizeScene(scene);
  const digest = sha1(stableStringify(normalized));
  return {
    sceneFilePath,
    normalized,
    digest,
    shortDigest: shortHash(digest)
  };
}

async function buildScenePayload(builds, game, mapId) {
  const gameConfig = getGameConfig(game.id);
  if (!gameConfig) {
    throw new Error(`Missing game config for ${game.id}`);
  }
  const job = await builds.createOrReuseBuild(gameConfig, mapId);
  await job.promise;
  if (job.status !== "ready") {
    throw new Error(`Build failed for ${game.id} map ${mapId}: ${job.error ?? "unknown error"}`);
  }
  return readScenePayload(job.build.sceneFilePath);
}

function compareCounts(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => a.localeCompare(b));
  const diffs = [];
  for (const key of keys) {
    const leftValue = left[key] ?? 0;
    const rightValue = right[key] ?? 0;
    if (leftValue !== rightValue) {
      diffs.push({ key, left: leftValue, right: rightValue, delta: rightValue - leftValue });
    }
  }
  return diffs;
}

function diffMetadata(left, right) {
  return {
    rawItemCount: { left: left.rawItemCount, right: right.rawItemCount, delta: right.rawItemCount - left.rawItemCount },
    itemCount: { left: left.itemCount, right: right.itemCount, delta: right.itemCount - left.itemCount },
    paintedItemCount: {
      left: left.paintedItemCount,
      right: right.paintedItemCount,
      delta: right.paintedItemCount - left.paintedItemCount
    },
    occludedItemCount: {
      left: left.occludedItemCount,
      right: right.occludedItemCount,
      delta: right.occludedItemCount - left.occludedItemCount
    },
    invalidItemCount: {
      left: left.invalidItemCount,
      right: right.invalidItemCount,
      delta: right.invalidItemCount - left.invalidItemCount
    },
    atlasCount: {
      left: left.sceneSummary?.atlasCount ?? 0,
      right: right.sceneSummary?.atlasCount ?? 0,
      delta: (right.sceneSummary?.atlasCount ?? 0) - (left.sceneSummary?.atlasCount ?? 0)
    },
    spriteCount: {
      left: left.sceneSummary?.spriteCount ?? 0,
      right: right.sceneSummary?.spriteCount ?? 0,
      delta: (right.sceneSummary?.spriteCount ?? 0) - (left.sceneSummary?.spriteCount ?? 0)
    },
    helperCount: {
      left: left.sceneSummary?.helperCount ?? 0,
      right: right.sceneSummary?.helperCount ?? 0,
      delta: (right.sceneSummary?.helperCount ?? 0) - (left.sceneSummary?.helperCount ?? 0)
    },
    kindCountDiffs: compareCounts(left.sceneSummary?.kindCounts ?? {}, right.sceneSummary?.kindCounts ?? {}),
    sourceCountDiffs: compareCounts(left.sceneSummary?.sourceCounts ?? {}, right.sceneSummary?.sourceCounts ?? {})
  };
}

function summarizePair(leftGame, rightGame, mapPayloadByGame) {
  const leftMaps = mapPayloadByGame.get(leftGame.id) ?? new Map();
  const rightMaps = mapPayloadByGame.get(rightGame.id) ?? new Map();
  const leftMapIds = [...leftMaps.keys()].sort((a, b) => a - b);
  const rightMapIds = [...rightMaps.keys()].sort((a, b) => a - b);
  const sharedMapIds = leftMapIds.filter((mapId) => rightMaps.has(mapId));
  const leftOnlyMapIds = leftMapIds.filter((mapId) => !rightMaps.has(mapId));
  const rightOnlyMapIds = rightMapIds.filter((mapId) => !leftMaps.has(mapId));
  const identicalMapIds = [];
  const differingMaps = [];

  for (const mapId of sharedMapIds) {
    const leftPayload = leftMaps.get(mapId);
    const rightPayload = rightMaps.get(mapId);
    if (leftPayload.digest === rightPayload.digest) {
      identicalMapIds.push(mapId);
      continue;
    }
    differingMaps.push({
      mapId,
      leftDigest: leftPayload.shortDigest,
      rightDigest: rightPayload.shortDigest,
      metadataDelta: diffMetadata(leftPayload.normalized.metadata, rightPayload.normalized.metadata)
    });
  }

  return {
    leftGame: leftGame.id,
    rightGame: rightGame.id,
    sharedMapIds,
    identicalMapIds,
    differingMapIds: differingMaps.map((entry) => entry.mapId),
    leftOnlyMapIds,
    rightOnlyMapIds,
    differingMaps
  };
}

function summarizeFamily(gameId, games, mapPayloadByGame) {
  const unionMapIds = [...new Set(games.flatMap((game) => [...(mapPayloadByGame.get(game.id)?.keys() ?? [])]))].sort((a, b) => a - b);
  const mapPresence = unionMapIds.map((mapId) => ({
    mapId,
    presentIn: games.filter((game) => mapPayloadByGame.get(game.id)?.has(mapId)).map((game) => game.id)
  }));
  const pairwise = [];
  for (let leftIndex = 0; leftIndex < games.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < games.length; rightIndex += 1) {
      pairwise.push(summarizePair(games[leftIndex], games[rightIndex], mapPayloadByGame));
    }
  }

  const perMapHashes = unionMapIds.map((mapId) => ({
    mapId,
    versions: games
      .filter((game) => mapPayloadByGame.get(game.id)?.has(mapId))
      .map((game) => {
        const payload = mapPayloadByGame.get(game.id).get(mapId);
        return {
          game: game.id,
          digest: payload.shortDigest,
          rawItemCount: payload.normalized.metadata.rawItemCount,
          itemCount: payload.normalized.metadata.itemCount,
          spriteCount: payload.normalized.metadata.sceneSummary?.spriteCount ?? 0,
          atlasCount: payload.normalized.metadata.sceneSummary?.atlasCount ?? 0
        };
      })
  }));

  return {
    family: gameId,
    games: games.map((game) => ({
      id: game.id,
      label: game.label,
      mapCount: game.maps.length,
      maps: game.maps.map((map) => map.id)
    })),
    unionMapIds,
    mapPresence,
    pairwise,
    perMapHashes
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Family Export Differences",
    "",
    "This report compares the normalized scene payload that export-static emits for each detected Crusader version.",
    "Build timestamps, fingerprints, version labels, and mission-table address notes are stripped before hashing so the digests reflect map-content differences rather than packaging metadata.",
    ""
  ];

  for (const family of report.families) {
    lines.push(`## ${family.family}`);
    lines.push("");
    lines.push(`Versions: ${family.games.map((game) => `${game.id} (${game.mapCount} maps)`).join(", ")}`);
    lines.push("");
    lines.push("### Map Presence");
    lines.push("");
    for (const row of family.mapPresence) {
      lines.push(`- Map ${row.mapId}: ${row.presentIn.join(", ")}`);
    }
    lines.push("");
    lines.push("### Pairwise Summary");
    lines.push("");
    for (const pair of family.pairwise) {
      lines.push(`- ${pair.leftGame} vs ${pair.rightGame}: ${pair.identicalMapIds.length} identical shared maps, ${pair.differingMapIds.length} differing shared maps, ${pair.leftOnlyMapIds.length} left-only maps, ${pair.rightOnlyMapIds.length} right-only maps.`);
    }
    lines.push("");
    lines.push("### Differing Shared Maps");
    lines.push("");
    const differingPairs = family.pairwise.filter((pair) => pair.differingMaps.length);
    if (!differingPairs.length) {
      lines.push("- None.");
      lines.push("");
      continue;
    }
    for (const pair of differingPairs) {
      lines.push(`#### ${pair.leftGame} vs ${pair.rightGame}`);
      lines.push("");
      for (const diff of pair.differingMaps) {
        const kindBits = diff.metadataDelta.kindCountDiffs
          .map((entry) => `${entry.key} ${entry.left}->${entry.right}`)
          .join(", ");
        const sourceBits = diff.metadataDelta.sourceCountDiffs
          .map((entry) => `${entry.key} ${entry.left}->${entry.right}`)
          .join(", ");
        lines.push(
          `- Map ${diff.mapId}: ${diff.leftDigest} vs ${diff.rightDigest}; raw ${diff.metadataDelta.rawItemCount.left}->${diff.metadataDelta.rawItemCount.right}, render ${diff.metadataDelta.itemCount.left}->${diff.metadataDelta.itemCount.right}, sprites ${diff.metadataDelta.spriteCount.left}->${diff.metadataDelta.spriteCount.right}, atlases ${diff.metadataDelta.atlasCount.left}->${diff.metadataDelta.atlasCount.right}${kindBits ? `; kinds ${kindBits}` : ""}${sourceBits ? `; sources ${sourceBits}` : ""}.`
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const catalog = detectCatalog();
  const builds = new BuildManager(catalog);
  const families = new Map();
  for (const game of catalog.games) {
    const list = families.get(game.gameId) ?? [];
    list.push(game);
    families.set(game.gameId, list);
  }

  const mapPayloadByGame = new Map();
  for (const game of catalog.games) {
    const payloads = new Map();
    for (const map of game.maps) {
      console.log(`building ${game.id} map ${map.id}`);
      payloads.set(map.id, await buildScenePayload(builds, game, map.id));
    }
    mapPayloadByGame.set(game.id, payloads);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    normalization: {
      strips: [
        "build metadata",
        "metadata.game",
        "metadata.gameLabel",
        "metadata.usage.note",
        "metadata.usage.tableAddress"
      ]
    },
    families: [...families.entries()].map(([gameId, games]) => summarizeFamily(gameId, games, mapPayloadByGame))
  };

  ensureDir(OUTPUT_DIR);
  writeJson(JSON_REPORT_PATH, report);
  fs.writeFileSync(MARKDOWN_REPORT_PATH, renderMarkdown(report), "utf8");

  console.log(`wrote ${JSON_REPORT_PATH}`);
  console.log(`wrote ${MARKDOWN_REPORT_PATH}`);
  for (const family of report.families) {
    const differingShared = family.pairwise.reduce((sum, pair) => sum + pair.differingMapIds.length, 0);
    console.log(`${family.family}: ${family.games.length} versions, ${family.unionMapIds.length} total maps, ${differingShared} differing shared-map comparisons`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});