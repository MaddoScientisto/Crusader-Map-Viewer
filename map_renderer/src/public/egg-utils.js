export function sortEggItems(items) {
  return items
    .filter((item) => item.egg)
    .sort((left, right) => {
      const idDelta = (left.egg?.labelId ?? Number.MAX_SAFE_INTEGER) - (right.egg?.labelId ?? Number.MAX_SAFE_INTEGER);
      if (idDelta !== 0) {
        return idDelta;
      }
      const yDelta = left.world.y - right.world.y;
      if (yDelta !== 0) {
        return yDelta;
      }
      return left.world.x - right.world.x;
    });
}

export function isTeleportLinkEgg(item) {
  return item?.egg?.type === "teleporter" || item?.egg?.type === "teleport-destination";
}

export function normalizeTeleportId(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xff) {
    throw new Error("Teleport IDs must be between 0 and 255.");
  }
  return parsed;
}

export function getTeleportIdConflicts(items, teleportId, excludeItemId = null) {
  if (!Array.isArray(items) || !Number.isInteger(teleportId)) {
    return [];
  }
  return items.filter((item) => isTeleportLinkEgg(item) && item.id !== excludeItemId && item.egg?.labelId === teleportId);
}

export function duplicateTeleportWarning(items, teleportId, excludeItemId = null) {
  const conflicts = getTeleportIdConflicts(items, teleportId, excludeItemId);
  if (!conflicts.length) {
    return "";
  }
  return `Warning: teleport ID ${teleportId} is already used by ${conflicts.length} other egg${conflicts.length === 1 ? "" : "s"}.`;
}

export function nextFreeTeleportEggId(items, preferredStart = 1) {
  const used = new Set(
    (items ?? [])
      .filter((item) => isTeleportLinkEgg(item))
      .map((item) => item.egg?.labelId)
      .filter(Number.isInteger)
  );

  for (let offset = 0; offset < 0x100; offset += 1) {
    const candidate = (preferredStart + offset) & 0xff;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return preferredStart & 0xff;
}

export function buildEggMetadataFromDefinition(item, definition) {
  const family = definition?.family;
  const rawQuality = item.quality & 0xffff;
  const rawMapNum = item.mapNum & 0xff;
  const rawNpcNum = item.npcNum & 0xff;
  switch (family) {
    case 8:
      return {
        family,
        type: item.frame === 1 ? "teleport-destination" : "teleporter",
        labelKind: "teleport-id",
        labelId: rawQuality & 0xff,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 7:
      return {
        family,
        type: "monster-spawn",
        labelKind: "monster-id",
        labelId: rawMapNum >> 3,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 4:
      return {
        family,
        type: "usecode-trigger",
        labelKind: "egg-id",
        labelId: rawMapNum,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    case 3:
      return {
        family,
        type: "glob",
        labelKind: "glob-id",
        labelId: rawQuality,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
    default:
      return {
        family,
        type: "egg",
        labelKind: "egg-id",
        labelId: rawMapNum || rawQuality,
        rawQuality,
        rawMapNum,
        rawNpcNum
      };
  }
}