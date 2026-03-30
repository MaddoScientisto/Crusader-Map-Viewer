import { APP_BASE_URL, state } from "../vue/controller/state.js";
import {
  canEditCatalogInRuntime,
  getRuntimeMode
} from "../shared/runtime-adapter.js";

export function appUrl(relativePath) {
  return new URL(relativePath, APP_BASE_URL);
}

export function trimTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/u, "");
}

export function isStaticMode() {
  return getRuntimeMode(state.siteConfig) === "static";
}

export function canEditCatalog() {
  return canEditCatalogInRuntime(state.siteConfig);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function encodeCatalogBoolean(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

export function decodeCatalogBoolean(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

export function cloneCatalogSnapshot(entry = null) {
  return {
    humanReadableId: String(entry?.humanReadableId ?? ""),
    description: String(entry?.description ?? ""),
    roof: entry?.roof ?? null,
    semitransparency: entry?.semitransparency ?? null,
    oob: entry?.oob ?? null
  };
}

export function catalogSnapshotsEqual(left, right) {
  return (
    left.humanReadableId === right.humanReadableId &&
    left.description === right.description &&
    left.roof === right.roof &&
    left.semitransparency === right.semitransparency &&
    left.oob === right.oob
  );
}

function formatHistoryFieldName(fieldName) {
  const labels = {
    humanReadableId: "name",
    description: "description",
    roof: "roof status",
    semitransparency: "transparency status",
    oob: "black out-of-bounds surface status"
  };
  return labels[fieldName] ?? fieldName;
}

export function listChangedCatalogFields(before, after) {
  return ["humanReadableId", "description", "roof", "semitransparency", "oob"].filter((fieldName) => before[fieldName] !== after[fieldName]);
}

export function formatUndoSummary(changedFields) {
  const labels = changedFields.map((fieldName) => formatHistoryFieldName(fieldName));
  if (labels.length <= 1) {
    return labels[0] ?? "catalog entry";
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function phaseProgress(build) {
  const phaseToValue = {
    queued: 5,
    "loading-assets": 14,
    "cache-check": 26,
    "cache-hit": 100,
    "loading-map": 36,
    "collecting-items": 52,
    sorting: 70,
    "packing-atlases": 82,
    "writing-atlases": 94,
    "loading-static-scene": 42,
    "loading-static-atlases": 82,
    ready: 100,
    failed: 100
  };
  return phaseToValue[build?.phase] ?? 8;
}

export async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Ignore parse failures.
    }
    throw new Error(message);
  }
  return response.json();
}

export async function loadSiteConfig() {
  return fetchJson(appUrl("site-config.json"));
}
