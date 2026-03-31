import { appUrl, fetchJson } from "./helpers.js";
import { getNpcSpawnerDataPath } from "../shared/runtime-adapter.js";

let npcSpawnerTables = null;

function formatShapeHex(shape) {
  return `0x${shape.toString(16).padStart(4, "0")}`;
}

export async function loadNpcSpawnerData(siteConfig = null) {
  try {
    npcSpawnerTables = await fetchJson(appUrl(getNpcSpawnerDataPath(siteConfig)));
  } catch (error) {
    console.warn("NPC spawner metadata unavailable; continuing without it", error);
    npcSpawnerTables = {};
  }
  return npcSpawnerTables;
}

export function getNpcSpawnerInfo(gameId, npcNum) {
  if (!Number.isInteger(npcNum) || npcNum < 0 || npcNum > 0xff) {
    return null;
  }

  const entry = npcSpawnerTables?.[gameId]?.[String(npcNum)] ?? null;
  if (!entry) {
    return null;
  }

  return {
    ...entry,
    index: npcNum,
    shapeHex: formatShapeHex(entry.shape)
  };
}