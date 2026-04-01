import { getUsecodeFilePath, getUsecodeIndexPath } from "./runtime-adapter.js";

const indexCache = new Map();
const fileCache = new Map();

const KEYWORDS = new Set([
  "else",
  "for",
  "function",
  "if",
  "in",
  "return",
  "spawn",
  "suspend",
  "while"
]);

function getIndexCacheKey(siteConfig, gameId) {
  return getUsecodeIndexPath(siteConfig, gameId);
}

function getFileCacheKey(siteConfig, gameId, filePath) {
  return getUsecodeFilePath(siteConfig, gameId, filePath);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function classifyIdentifier(value, nextChar = "") {
  if (!value) {
    return "plain";
  }
  if (KEYWORDS.has(value)) {
    return "keyword";
  }
  if (/^(?:local|arg)_[0-9a-f]+$/i.test(value)) {
    return "variable";
  }
  if (/^0x[0-9a-f]+$/i.test(value) || /^[0-9]+$/i.test(value)) {
    return "number";
  }
  if (/^[A-Z][A-Z0-9_]*$/u.test(value) || /^[A-Z][A-Za-z0-9_]*$/u.test(value)) {
    return "namespace";
  }
  if (nextChar === "(") {
    return "call";
  }
  return "plain";
}

function renderIdentifierToken(value, nextChar = "") {
  const parts = value.split(".");
  return parts.map((part, index) => {
    const followingChar = index === (parts.length - 1) ? nextChar : ".";
    const tokenClass = classifyIdentifier(part, followingChar);
    const rendered = tokenClass === "plain"
      ? escapeHtml(part)
      : `<span class="usecode-token-${tokenClass}">${escapeHtml(part)}</span>`;
    return index === 0 ? rendered : `.<span class="usecode-token-member">${escapeHtml(part)}</span>`;
  }).join("");
}

function renderToken(value, tokenClass) {
  if (!value) {
    return "";
  }
  if (!tokenClass || tokenClass === "plain") {
    return escapeHtml(value);
  }
  return `<span class="usecode-token-${tokenClass}">${escapeHtml(value)}</span>`;
}

function highlightUsecodeLine(line) {
  let index = 0;
  let html = "";

  while (index < line.length) {
    if (line.startsWith("/*", index)) {
      const commentEnd = line.indexOf("*/", index + 2);
      const endIndex = commentEnd >= 0 ? (commentEnd + 2) : line.length;
      html += renderToken(line.slice(index, endIndex), "comment");
      index = endIndex;
      continue;
    }

    const char = line[index];
    if (char === '"' || char === "'") {
      let endIndex = index + 1;
      while (endIndex < line.length) {
        if (line[endIndex] === "\\") {
          endIndex += 2;
          continue;
        }
        if (line[endIndex] === char) {
          endIndex += 1;
          break;
        }
        endIndex += 1;
      }
      html += renderToken(line.slice(index, endIndex), "string");
      index = endIndex;
      continue;
    }

    if (/^[0-9]$/u.test(char)) {
      let endIndex = index + 1;
      while (endIndex < line.length && /[0-9a-fx]/iu.test(line[endIndex])) {
        endIndex += 1;
      }
      html += renderToken(line.slice(index, endIndex), "number");
      index = endIndex;
      continue;
    }

    if (/^[A-Za-z_]$/u.test(char)) {
      let endIndex = index + 1;
      while (endIndex < line.length && /[A-Za-z0-9_.]/u.test(line[endIndex])) {
        endIndex += 1;
      }
      html += renderIdentifierToken(line.slice(index, endIndex), line[endIndex] ?? "");
      index = endIndex;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  return html;
}

export function highlightUsecodeText(text) {
  return String(text ?? "")
    .split(/\r?\n/u)
    .map((line) => highlightUsecodeLine(line))
    .join("\n");
}

export function buildUsecodePreviewText(text, options = {}) {
  const maxLines = Number.isInteger(options.maxLines) ? options.maxLines : 18;
  const maxCharacters = Number.isInteger(options.maxCharacters) ? options.maxCharacters : 2000;
  const lines = String(text ?? "").split(/\r?\n/u);
  const previewLines = [];
  let characterCount = 0;

  for (const line of lines) {
    if (previewLines.length >= maxLines || characterCount >= maxCharacters) {
      break;
    }
    previewLines.push(line);
    characterCount += line.length + 1;
  }

  if (previewLines.length < lines.length || characterCount >= maxCharacters) {
    previewLines.push("/* preview truncated */");
  }

  return previewLines.join("\n");
}

export function normalizeEventNameHint(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeSlotValue(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^0x[0-9a-f]+$/iu.test(text)) {
    return Number.parseInt(text.slice(2), 16);
  }
  if (/^[0-9]+$/u.test(text)) {
    return Number.parseInt(text, 10);
  }
  return null;
}

export function formatTargetSlot(slot) {
  const slotValue = normalizeSlotValue(slot);
  if (slotValue === null) {
    return "unknown slot";
  }
  return `slot 0x${slotValue.toString(16).padStart(2, "0")}`;
}

export function sanitizeUsecodeTarget(target) {
  if (!target?.className) {
    return null;
  }

  const className = String(target.className).trim().toUpperCase();
  if (!className) {
    return null;
  }

  const slot = normalizeSlotValue(target.slot);
  const eventNameHint = String(target.eventNameHint ?? "").trim() || null;
  const fallbackEventNameHints = Array.isArray(target.fallbackEventNameHints)
    ? target.fallbackEventNameHints.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  return {
    className,
    slot,
    eventNameHint,
    fallbackEventNameHints,
    itemId: target.itemId ?? null,
    itemLabel: target.itemLabel ?? null,
    displayName: target.displayName ?? null,
    label: target.label ?? null,
    title: target.title ?? null,
    note: target.note ?? null
  };
}

export function describeUsecodeTarget(target) {
  const safeTarget = sanitizeUsecodeTarget(target);
  if (!safeTarget) {
    return "selected usecode target";
  }
  const eventLabel = safeTarget.eventNameHint || formatTargetSlot(safeTarget.slot);
  return `${safeTarget.className}.${eventLabel}`;
}

export function flattenSourceFiles(sources) {
  return sources.flatMap((source) => Array.isArray(source.files) ? source.files : []);
}

export function findUsecodeFile(sourceFiles, target) {
  const safeTarget = sanitizeUsecodeTarget(target);
  if (!safeTarget) {
    return null;
  }

  const classFiles = sourceFiles.filter((file) => String(file.className ?? "").trim().toUpperCase() === safeTarget.className);
  if (!classFiles.length) {
    return null;
  }

  if (safeTarget.slot !== null) {
    const slotMatch = classFiles.find((file) => normalizeSlotValue(file.slot) === safeTarget.slot);
    if (slotMatch) {
      return slotMatch;
    }
  }

  const eventCandidates = [safeTarget.eventNameHint, ...safeTarget.fallbackEventNameHints]
    .map((value) => normalizeEventNameHint(value))
    .filter(Boolean);
  for (const eventName of eventCandidates) {
    const eventMatch = classFiles.find((file) => normalizeEventNameHint(file.eventNameHint) === eventName);
    if (eventMatch) {
      return eventMatch;
    }
  }

  return classFiles[0] ?? null;
}

export async function loadUsecodeIndex(siteConfig, gameId) {
  const cacheKey = getIndexCacheKey(siteConfig, gameId);
  if (!indexCache.has(cacheKey)) {
    const promise = fetch(cacheKey)
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((json) => {
        const sources = json.sources || [];
        return {
          sources,
          sourceFiles: flattenSourceFiles(sources)
        };
      })
      .catch((error) => {
        indexCache.delete(cacheKey);
        throw error;
      });
    indexCache.set(cacheKey, promise);
  }
  return indexCache.get(cacheKey);
}

export async function resolveUsecodeTargetFile(siteConfig, gameId, target) {
  const { sourceFiles } = await loadUsecodeIndex(siteConfig, gameId);
  return findUsecodeFile(sourceFiles, target);
}

export async function loadUsecodeText(siteConfig, gameId, filePath) {
  const cacheKey = getFileCacheKey(siteConfig, gameId, filePath);
  if (!fileCache.has(cacheKey)) {
    const promise = fetch(cacheKey)
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText || `HTTP ${response.status}`);
        }
        return response.text();
      })
      .catch((error) => {
        fileCache.delete(cacheKey);
        throw error;
      });
    fileCache.set(cacheKey, promise);
  }
  return fileCache.get(cacheKey);
}