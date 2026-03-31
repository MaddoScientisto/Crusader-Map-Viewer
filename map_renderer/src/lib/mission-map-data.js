import fs from "node:fs";
import path from "node:path";

import { APP_ROOT, MISSION_MAP_CACHE_FILE, GAMES } from "../config.js";
import { readU16LE } from "./binary.js";

// Prefer retail executables found in the static export folders next to the renderer.
// Fall back to env var or the renderer root if needed.

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

function getGameConfig(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}

function toHex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function segmentAddress(profile, offset) {
  return `${profile.dataSegment}:${offset.toString(16).padStart(4, "0")}`;
}

function resolveExePath(profile, gameEntry) {
  const executableFileName = gameEntry?.missionTableExecutableFileName ?? profile.exeName;
  const candidates = [
    process.env[profile.envVar],
    // Check the game's staticDir (for example STATIC_1.01 or STATIC_REGRET).
    gameEntry && gameEntry.staticDir ? path.join(gameEntry.staticDir, executableFileName) : null,
    // Finally check alongside the renderer root
    path.join(APP_ROOT, executableFileName)
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Missing ${executableFileName}. Set ${profile.envVar} or place the required executable payload in the game's static export folder or beside the renderer.`
  );
}

function buildMissionMapTableFromBaseMaps(profile, baseMaps, options = {}) {
  const entries = baseMaps.map((baseMap, mission) => ({
    mission,
    baseMap,
    address: options.tableAddress && profile.tableOffset !== undefined
      ? options.addresses?.[mission] ?? null
      : options.addresses?.[mission] ?? null
  }));
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
    tableAddress: options.tableAddress ?? segmentAddress(profile, profile.tableOffset),
    tableFileOffset: options.tableFileOffset ?? null,
    terminatorAddress: options.terminatorAddress ?? null,
    terminatorFileOffset: options.terminatorFileOffset ?? null,
    consumerFunction: options.consumerFunction ?? profile.consumerFunction,
    consumerAddress: options.consumerAddress ?? profile.consumerAddress,
    entryCount: entries.length,
    baseMaps,
    entries,
    mapToMissions,
    notes: options.notes ?? []
  };
}

export function extractMissionMapTable(profile, exePath, gameEntry = null) {
  const data = fs.readFileSync(exePath);
  const explicitTableFileOffset = Number.isInteger(gameEntry?.missionTableAbsoluteFileOffset)
    ? gameEntry.missionTableAbsoluteFileOffset
    : null;
  const dataSegmentFileOffset = gameEntry?.missionTableDataSegmentFileOffset ?? profile.dataSegmentFileOffset;
  const tableFileOffset = explicitTableFileOffset ?? (dataSegmentFileOffset + profile.tableOffset);
  const entryCountOverride = Number.isInteger(gameEntry?.missionTableEntryCount) ? gameEntry.missionTableEntryCount : null;
  const entries = [];

  if (entryCountOverride !== null) {
    for (let mission = 0; mission < entryCountOverride; mission += 1) {
      const entryOffset = tableFileOffset + mission * 2;
      if (entryOffset + 2 > data.length) {
        throw new Error(`Mission map table for ${profile.game} runs past EOF at ${toHex(entryOffset, 6)}`);
      }
      entries.push({
        mission,
        baseMap: readU16LE(data, entryOffset),
        address: segmentAddress(profile, profile.tableOffset + mission * 2)
      });
    }

    return buildMissionMapTableFromBaseMaps(
      profile,
      entries.map((entry) => entry.baseMap),
      {
        tableAddress: segmentAddress(profile, profile.tableOffset),
        tableFileOffset: toHex(tableFileOffset, 6),
        consumerFunction: profile.consumerFunction,
        consumerAddress: profile.consumerAddress,
        addresses: entries.map((entry) => entry.address),
        notes: [
          `${profile.exeName} mission table extracted from version-specific offset ${toHex(tableFileOffset, 6)} with a fixed ${entryCountOverride}-entry length override.`,
          `This version does not use the retail double-zero sentinel immediately after the mission table, so extraction is length-bounded instead of sentinel-bounded.`
        ]
      }
    );
  }

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

export function collectMissionMapTables(games = GAMES) {
  const tables = {};

  for (const game of games) {
    if (game.supportsMissionMapExtraction === false) {
      continue;
    }

    const profile = PROFILES[game.gameId ?? game.id];
    if (!profile) {
      continue;
    }

    if (Array.isArray(game.missionTableBaseMaps) && game.missionTableBaseMaps.length > 0) {
      tables[game.id] = buildMissionMapTableFromBaseMaps(profile, game.missionTableBaseMaps, {
        tableAddress: game.missionTableAddress ?? null,
        consumerFunction: game.missionTableConsumerFunction ?? profile.consumerFunction,
        consumerAddress: game.missionTableConsumerAddress ?? profile.consumerAddress,
        notes: [
          `Mission table reconstructed from a verified Ghidra live-table read for this version rather than from a local executable file.`,
          `JP live analysis showed FUN_00428e00 loading baseMap = word[mission*2 + 0x0047b72c] and then adding -mapoff from 0x004957e8.`
        ]
      });
      continue;
    }

    try {
      const exePath = resolveExePath(profile, game);
      tables[game.id] = extractMissionMapTable(profile, exePath, game);
    } catch {
      // Allow scene builds to proceed when a version root lacks the retail executable.
    }
  }

  return tables;
}

export function buildMissionMapData(gameTablesById) {
  const remorseKey = Object.keys(gameTablesById).find((gameId) => getGameConfig(gameId)?.gameId === "remorse");
  const regretKey = Object.keys(gameTablesById).find((gameId) => getGameConfig(gameId)?.gameId === "regret");
  const remorseBaseMaps = remorseKey ? gameTablesById[remorseKey]?.baseMaps ?? [] : [];
  const regretBaseMaps = regretKey ? gameTablesById[regretKey]?.baseMaps ?? [] : [];
  const sharedBaseMapSequence =
    remorseBaseMaps.length > 0 &&
    remorseBaseMaps.length === regretBaseMaps.length &&
    remorseBaseMaps.every((value, index) => value === regretBaseMaps[index]);

  return {
    generatedAt: new Date().toISOString(),
    source: "version_executable_bytes_and_verified_ghidra_tables",
    sharedBaseMapSequence,
    games: gameTablesById
  };
}

export function writeMissionMapData(outputFile = MISSION_MAP_CACHE_FILE, games = GAMES) {
  const gameTablesById = collectMissionMapTables(games);
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