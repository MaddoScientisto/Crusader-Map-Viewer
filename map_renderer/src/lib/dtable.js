import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { GAMES, TABLES_ROOT } from "../config.js";

const DTABLE_FILE_BY_GAME = {
  remorse: "dtable_get_name_dump.json",
  regret: "regret_dtable_get_name_dump.json"
};

const dtableCache = new Map();

function getTableSourceGameId(gameId) {
  return GAMES.find((game) => game.id === gameId)?.tableId ?? gameId;
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function gameLabelForComment(gameId) {
  const resolvedGameId = getTableSourceGameId(gameId);
  if (resolvedGameId === "remorse") {
    return "Remorse";
  }
  if (resolvedGameId === "regret") {
    return "Regret";
  }
  return resolvedGameId;
}

function normalizeResolvedEntry(gameId, row) {
  const shapeCode = Number(row?.shape ?? row?.shapeCode ?? Number.NaN);
  if (!Number.isInteger(shapeCode)) {
    return null;
  }

  const resolvedName = String(row?.resolved_name ?? row?.resolvedName ?? "").trim();
  if (!resolvedName) {
    return null;
  }

  const resolvedCategory = String(row?.resolved_category ?? row?.resolvedCategory ?? "").trim();
  const displayFrameHex = String(row?.display_frame_hex ?? row?.displayFrameHex ?? "").trim();
  const helperName = String(row?.resolved_helper_name ?? row?.resolvedHelperName ?? "").trim();

  const detailBits = [];
  if (resolvedCategory) {
    detailBits.push(resolvedCategory);
  }
  if (displayFrameHex) {
    detailBits.push(`display frame ${displayFrameHex}`);
  }
  if (helperName) {
    detailBits.push(helperName);
  }

  const description = detailBits.length
    ? `Retail ${gameLabelForComment(gameId)} DTable: ${resolvedName} (${detailBits.join(", ")}).`
    : `Retail ${gameLabelForComment(gameId)} DTable: ${resolvedName}.`;

  return {
    shapeCode,
    humanReadableId: resolvedName,
    description,
    resolvedName,
    resolvedCategory,
    resolvedHelperName: helperName,
    displayFrame: row?.display_frame ?? row?.displayFrame ?? null,
    displayFrameHex,
    raw: row
  };
}

function getTablePath(gameId) {
  const fileName = DTABLE_FILE_BY_GAME[getTableSourceGameId(gameId)];
  if (!fileName) {
    return null;
  }
  return path.join(TABLES_ROOT, fileName);
}

export function getShapeNameTableFile(gameId) {
  return getTablePath(gameId);
}

export function getShapeNameTable(gameId) {
  const filePath = getTablePath(gameId);
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      filePath,
      digest: "missing",
      entries: new Map()
    };
  }

  const stat = fs.statSync(filePath);
  const stamp = `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  const cacheKey = getTableSourceGameId(gameId);
  const cached = dtableCache.get(cacheKey);
  if (cached?.stamp === stamp) {
    return cached.value;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(text);
  const entries = new Map();
  for (const row of payload?.resolved_shapes ?? []) {
    const entry = normalizeResolvedEntry(gameId, row);
    if (entry) {
      entries.set(entry.shapeCode, entry);
    }
  }

  const value = {
    filePath,
    digest: sha1(text),
    entries
  };
  dtableCache.set(cacheKey, { stamp, value });
  return value;
}
