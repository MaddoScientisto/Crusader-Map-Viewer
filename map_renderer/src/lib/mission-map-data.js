import fs from "node:fs";
import path from "node:path";

import { APP_ROOT, MISSION_MAP_CACHE_FILE } from "../config.js";
import { readU16LE } from "./binary.js";

const SIBLING_PRIVATE_REPO_ROOT = path.resolve(APP_ROOT, "..", "..", "Crusader_Decomp");

const PROFILES = {
  remorse: {
    game: "remorse",
    gameLabel: "No Remorse",
    exeName: "CRUSADER.EXE",
    envVar: "REMORSE_EXE_PATH",
    dataSegment: "1478",
    dataSegmentFileOffset: 0x0e3c00,
    tableOffset: 0x0488,
    consumerFunction: "Game_Start",
    consumerAddress: "1020:025a"
  },
  regret: {
    game: "regret",
    gameLabel: "No Regret",
    exeName: "REGRET.EXE",
    envVar: "REGRET_EXE_PATH",
    dataSegment: "1480",
    dataSegmentFileOffset: 0x0e2400,
    tableOffset: 0x075c,
    consumerFunction: "Game_RunNewGameFlow",
    consumerAddress: "1030:05dd"
  }
};

let cachedMissionMapData = null;
let cachedMissionMapFile = null;
let cachedMissionMapMtimeMs = null;

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function segmentAddress(profile, offset) {
  return `${profile.dataSegment}:${offset.toString(16).padStart(4, "0")}`;
}

function resolveExePath(profile) {
  const candidates = [
    process.env[profile.envVar],
    path.join(SIBLING_PRIVATE_REPO_ROOT, profile.exeName),
    path.join(APP_ROOT, profile.exeName)
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Missing ${profile.exeName}. Set ${profile.envVar} or place the retail executable beside the renderer or in ${SIBLING_PRIVATE_REPO_ROOT}.`
  );
}

export function extractMissionMapTable(profile, exePath) {
  const data = fs.readFileSync(exePath);
  const tableFileOffset = profile.dataSegmentFileOffset + profile.tableOffset;
  const entries = [];

  for (let mission = 0; mission < 0x100; mission += 1) {
    const entryOffset = tableFileOffset + mission * 2;
    if (entryOffset + 4 > data.length) {
      throw new Error(`Mission map table for ${profile.game} runs past EOF at ${toHex(entryOffset, 6)}`);
    }
    const baseMap = readU16LE(data, entryOffset);
    const nextWord = readU16LE(data, entryOffset + 2);
    if (mission > 0 && baseMap === 0 && nextWord === 0) {
      const mapToMissions = {};
      for (const entry of entries) {
        const key = String(entry.baseMap);
        if (!mapToMissions[key]) {
          mapToMissions[key] = [];
        }
        mapToMissions[key].push(entry.mission);
      }
      return {
        game: profile.game,
        gameLabel: profile.gameLabel,
        exeName: profile.exeName,
        dataSegment: profile.dataSegment,
        tableAddress: segmentAddress(profile, profile.tableOffset),
        tableFileOffset: toHex(tableFileOffset, 6),
        terminatorAddress: segmentAddress(profile, profile.tableOffset + entries.length * 2),
        terminatorFileOffset: toHex(tableFileOffset + entries.length * 2, 6),
        consumerFunction: profile.consumerFunction,
        consumerAddress: profile.consumerAddress,
        entryCount: entries.length,
        baseMaps: entries.map((entry) => entry.baseMap),
        entries,
        mapToMissions,
        notes: [
          `Retail ${profile.exeName} computes target_map = mission_table[mission] + mapoff in ${profile.consumerFunction}.`,
          `The extracted table is terminated by the double-zero sentinel at ${segmentAddress(profile, profile.tableOffset + entries.length * 2)}.`
        ]
      };
    }
    entries.push({
      mission,
      baseMap,
      address: segmentAddress(profile, profile.tableOffset + mission * 2)
    });
  }

  throw new Error(`Mission map table for ${profile.game} exceeded the 256-entry safety limit without a terminator`);
}

export function collectMissionMapTables() {
  return Object.fromEntries(
    Object.values(PROFILES).map((profile) => {
      const exePath = resolveExePath(profile);
      return [profile.game, extractMissionMapTable(profile, exePath)];
    })
  );
}

export function buildMissionMapData(gameTablesById) {
  const remorseBaseMaps = gameTablesById.remorse?.baseMaps ?? [];
  const regretBaseMaps = gameTablesById.regret?.baseMaps ?? [];
  const sharedBaseMapSequence =
    remorseBaseMaps.length > 0 &&
    remorseBaseMaps.length === regretBaseMaps.length &&
    remorseBaseMaps.every((value, index) => value === regretBaseMaps[index]);

  return {
    generatedAt: new Date().toISOString(),
    source: "retail_exe_bytes",
    sharedBaseMapSequence,
    games: gameTablesById
  };
}

export function writeMissionMapData(outputFile = MISSION_MAP_CACHE_FILE) {
  const gameTablesById = collectMissionMapTables();
  const payload = buildMissionMapData(gameTablesById);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { outputFile, gameTablesById, payload };
}

export function loadMissionMapData(cacheFile = MISSION_MAP_CACHE_FILE) {
  if (!fs.existsSync(cacheFile)) {
    cachedMissionMapData = null;
    cachedMissionMapFile = null;
    cachedMissionMapMtimeMs = null;
    return null;
  }

  const stat = fs.statSync(cacheFile);
  if (cachedMissionMapData && cachedMissionMapFile === cacheFile && cachedMissionMapMtimeMs === stat.mtimeMs) {
    return cachedMissionMapData;
  }

  cachedMissionMapData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  cachedMissionMapFile = cacheFile;
  cachedMissionMapMtimeMs = stat.mtimeMs;
  return cachedMissionMapData;
}

export function getMissionMapTable(gameId, cacheFile = MISSION_MAP_CACHE_FILE) {
  const payload = loadMissionMapData(cacheFile);
  return payload?.games?.[gameId] ?? null;
}