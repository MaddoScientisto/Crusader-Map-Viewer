import { appUrl, fetchJson } from "./helpers.js";

let npcSpawnerTables = null;

function formatShapeHex(shape) {
  return `0x${shape.toString(16).padStart(4, "0")}`;
}

export async function loadNpcSpawnerData(siteConfig = null) {
  npcSpawnerTables = await fetchJson(appUrl(siteConfig?.npcSpawnerDataUrl ?? "./api/npc-spawner-data"));
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