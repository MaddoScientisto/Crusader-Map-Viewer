import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CATALOG_ROOT, GAMES } from "../config.js";
import { getShapeNameTable } from "./dtable.js";
import { getMapSummaries, resolveStaticFile } from "./formats.js";

const CATALOG_FILE_BY_GAME = {
  remorse: "usecode_shape_catalog_remorse.csv",
  regret: "usecode_shape_catalog_regret.csv"
};

const shapeCatalogCache = new Map();
const CATALOG_HEADERS = ["shape_code", "human_readable_id", "description", "roof", "semitransparency", "OOB", "categorization", "qualities"];

function getCatalogSourceGameId(gameId) {
  return GAMES.find((game) => game.id === gameId)?.catalogId ?? gameId;
}

function toShapeCodeHex(shapeCode) {
  return `0x${shapeCode.toString(16).padStart(4, "0")}`;
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseOptionalBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return null;
}

function getRowValue(row, ...keys) {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) {
      return row[key];
    }
  }
  return "";
}

function normalizeCatalogEntry(row) {
  const shapeCode = Number.parseInt(String(getRowValue(row, "shape_code", "shapeCode", "ShapeCode")).trim(), 16);
  if (!Number.isInteger(shapeCode)) {
    return null;
  }
  return {
    shapeCode,
    shapeCodeHex: toShapeCodeHex(shapeCode),
    humanReadableId: String(getRowValue(row, "human_readable_id", "humanReadableId", "HumanReadableId")).trim(),
    description: String(getRowValue(row, "description", "Description")).trim(),
    roof: parseOptionalBoolean(getRowValue(row, "roof", "Roof")),
    semitransparency: parseOptionalBoolean(getRowValue(row, "semitransparency", "semi_transparency", "Semitransparency", "SemiTransparency")),
    oob: parseOptionalBoolean(getRowValue(row, "OOB", "oob", "OutOfBounds")),
    categorization: String(getRowValue(row, "categorization", "category", "Categorization", "Category")).trim(),
    qualities: String(getRowValue(row, "qualities", "quality_values", "Qualities", "QualityValues")).trim()
  };
}

function parseCatalogCsv(text) {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (!lines.length) {
    return new Map();
  }

  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  const entries = new Map();
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);
    const row = {};
    for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
      row[headers[headerIndex]] = values[headerIndex] ?? "";
    }
    const entry = normalizeCatalogEntry(row);
    if (entry) {
      entries.set(entry.shapeCode, entry);
    }
  }
  return entries;
}

function formatOptionalBoolean(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/u.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function serializeCatalog(entries) {
  const lines = [CATALOG_HEADERS.join(",")];
  const sortedEntries = [...entries.values()].sort((left, right) => left.shapeCode - right.shapeCode);
  for (const entry of sortedEntries) {
    lines.push(
      [
        entry.shapeCodeHex,
        entry.humanReadableId,
        entry.description,
        formatOptionalBoolean(entry.roof),
        formatOptionalBoolean(entry.semitransparency),
        formatOptionalBoolean(entry.oob),
        entry.categorization,
        entry.qualities
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseShapeCode(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    throw new Error("Shape code is required");
  }
  const isHex = text.startsWith("0x");
  const normalized = isHex ? text.slice(2) : text;
  const shapeCode = Number.parseInt(normalized, isHex ? 16 : 10);
  if (!Number.isInteger(shapeCode) || shapeCode < 0 || shapeCode > 0xffff) {
    throw new Error(`Invalid shape code: ${value}`);
  }
  return shapeCode;
}

function createCatalogEntry(shapeCode, overrides = {}) {
  return {
    shapeCode,
    shapeCodeHex: toShapeCodeHex(shapeCode),
    humanReadableId: "",
    description: "",
    roof: null,
    semitransparency: null,
    oob: null,
    categorization: "",
    qualities: "",
    ...overrides
  };
}

function sanitizeCatalogText(value, fieldName) {
  const text = String(value ?? "").trim();
  if (/[\r\n]/u.test(text)) {
    throw new Error(`${fieldName} cannot contain line breaks`);
  }
  return text;
}

function appendUniqueCatalogDescription(existingText, additionText) {
  const existing = String(existingText ?? "").trim();
  const addition = String(additionText ?? "").trim();
  if (!addition) {
    return existing;
  }
  if (!existing) {
    return addition;
  }
  if (existing.includes(addition)) {
    return existing;
  }
  return `${existing} ${addition}`;
}

function parseEditableBoolean(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "auto") {
      return null;
    }
    const parsed = parseOptionalBoolean(normalized);
    if (parsed !== null) {
      return parsed;
    }
  }
  throw new Error(`${fieldName} must be true, false, or auto`);
}

function getCatalogPath(gameId) {
  const fileName = CATALOG_FILE_BY_GAME[getCatalogSourceGameId(gameId)];
  if (!fileName) {
    return null;
  }
  return path.join(CATALOG_ROOT, fileName);
}

export function getShapeCatalogFile(gameId) {
  return getCatalogPath(gameId);
}

export function getShapeCatalog(gameId) {
  const filePath = getCatalogPath(gameId);
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      filePath,
      digest: "missing",
      entries: new Map()
    };
  }

  const stat = fs.statSync(filePath);
  const stamp = `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  const cacheKey = getCatalogSourceGameId(gameId);
  const cached = shapeCatalogCache.get(cacheKey);
  if (cached?.stamp === stamp) {
    return cached.value;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const value = {
    filePath,
    digest: sha1(text),
    entries: parseCatalogCsv(text)
  };
  shapeCatalogCache.set(cacheKey, { stamp, value });
  return value;
}

export function ensureShapeCatalogCoverage(gameId, observedShapes) {
  const filePath = getCatalogPath(gameId);
  if (!filePath) {
    return {
      changed: false,
      added: 0,
      filePath: null
    };
  }

  const existing = getShapeCatalog(gameId);
  const entries = new Map(existing.entries);
  let added = 0;
  let updated = 0;

  for (const observed of observedShapes) {
    if (entries.has(observed.shapeCode)) {
      const entry = entries.get(observed.shapeCode);
      let changed = false;
      if (!entry.categorization && observed.categorization) {
        entry.categorization = observed.categorization;
        changed = true;
      }
      if (!entry.qualities && observed.qualities) {
        entry.qualities = observed.qualities;
        changed = true;
      }
      if (changed) {
        updated += 1;
      }
      continue;
    }
    entries.set(observed.shapeCode, {
      shapeCode: observed.shapeCode,
      shapeCodeHex: toShapeCodeHex(observed.shapeCode),
      humanReadableId: "",
      description: observed.isEditor ? "Editor Object" : "",
      roof: null,
      semitransparency: null,
      oob: null,
      categorization: observed.categorization,
      qualities: observed.qualities
    });
    added += 1;
  }

  if (!added && !updated) {
    return {
      changed: false,
      added: 0,
      updated: 0,
      filePath
    };
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = serializeCatalog(entries);
  fs.writeFileSync(filePath, serialized, "utf8");
  shapeCatalogCache.delete(getCatalogSourceGameId(gameId));
  return {
    changed: true,
    added,
    updated,
    filePath
  };
}

export function updateShapeCatalogEntry(gameId, shapeCodeValue, updates = {}) {
  const filePath = getCatalogPath(gameId);
  if (!filePath) {
    throw new Error("Unknown game id");
  }

  const shapeCode = parseShapeCode(shapeCodeValue);
  const existing = getShapeCatalog(gameId);
  const entries = new Map(existing.entries);
  const current = entries.get(shapeCode) ?? createCatalogEntry(shapeCode);
  const next = {
    ...current,
    shapeCode,
    shapeCodeHex: toShapeCodeHex(shapeCode),
    humanReadableId: sanitizeCatalogText(updates.humanReadableId ?? current.humanReadableId, "Catalog name"),
    description: sanitizeCatalogText(updates.description ?? current.description, "Catalog description"),
    roof: parseEditableBoolean(updates.roof ?? current.roof, "Roof status"),
    semitransparency: parseEditableBoolean(updates.semitransparency ?? current.semitransparency, "Transparency status"),
    oob: parseEditableBoolean(updates.oob ?? current.oob, "Out-of-bounds surface status")
  };

  entries.set(shapeCode, next);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeCatalog(entries), "utf8");
  shapeCatalogCache.delete(getCatalogSourceGameId(gameId));

  return {
    filePath,
    entry: next
  };
}

export function syncShapeCatalogWithDtable(gameId, options = {}) {
  const filePath = getCatalogPath(gameId);
  if (!filePath) {
    throw new Error("Unknown game id");
  }

  const dryRun = options.dryRun === true;
  const existing = getShapeCatalog(gameId);
  const dtable = getShapeNameTable(gameId);
  if (!dtable.entries.size) {
    return {
      changed: false,
      created: 0,
      updated: 0,
      untouched: 0,
      filePath,
      tableFilePath: dtable.filePath,
      tableEntryCount: 0,
      dryRun
    };
  }

  const entries = new Map(existing.entries);
  let created = 0;
  let updated = 0;
  let untouched = 0;

  for (const dtableEntry of [...dtable.entries.values()].sort((left, right) => left.shapeCode - right.shapeCode)) {
    const hadEntry = entries.has(dtableEntry.shapeCode);
    const current = entries.get(dtableEntry.shapeCode) ?? createCatalogEntry(dtableEntry.shapeCode);
    const next = {
      ...current,
      shapeCode: dtableEntry.shapeCode,
      shapeCodeHex: toShapeCodeHex(dtableEntry.shapeCode),
      humanReadableId: dtableEntry.humanReadableId,
      description: appendUniqueCatalogDescription(current.description, dtableEntry.description)
    };

    const changed = !hadEntry || current.humanReadableId !== next.humanReadableId || current.description !== next.description;
    if (!changed) {
      untouched += 1;
      continue;
    }

    if (hadEntry) {
      updated += 1;
    } else {
      created += 1;
    }
    entries.set(dtableEntry.shapeCode, next);
  }

  if (!dryRun && (created || updated)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, serializeCatalog(entries), "utf8");
    shapeCatalogCache.delete(getCatalogSourceGameId(gameId));
  }

  return {
    changed: created > 0 || updated > 0,
    created,
    updated,
    untouched,
    filePath,
    tableFilePath: dtable.filePath,
    tableEntryCount: dtable.entries.size,
    dryRun
  };
}

export function detectCatalog() {
  const games = [];
  for (const game of GAMES) {
    const fixedDat = resolveStaticFile(game.staticDir, "FIXED.DAT");
    if (!fs.existsSync(fixedDat)) {
      continue;
    }
    const maps = getMapSummaries(fixedDat)
      .filter((map) => map.isValid && map.rawItemCount > 0)
      .map((map) => ({
        id: map.id,
        label: `Map ${map.id}`,
        rawItemCount: map.rawItemCount
      }));
    if (maps.length > 0) {
      games.push({
        id: game.id,
        gameId: game.gameId,
        versionId: game.versionId,
        versionLabel: game.versionLabel,
        label: game.label,
        selectorLabel: game.selectorLabel ?? game.label,
        mapCount: maps.length,
        maps
      });
    }
  }
  return { games };
}

export function getGameConfig(gameId) {
  return GAMES.find((game) => game.id === gameId) ?? null;
}
