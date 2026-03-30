export function formatHex(value, width = 2) {
  return `0x${Number(value).toString(16).padStart(width, "0")}`;
}

export function formatEggId(value) {
  if (!Number.isInteger(value)) {
    return "-";
  }
  return `${value} (${formatHex(value, value > 0xff ? 4 : 2)})`;
}

export function formatWorldCoords(item) {
  return `${item.world.x}, ${item.world.y}, ${item.world.z}`;
}

export function formatDiskCoords(item) {
  return `${Math.trunc(item.world.x / 2)}, ${Math.trunc(item.world.y / 2)}, ${item.world.z}`;
}

export function formatNumericField(value) {
  return Number.isInteger(value) ? String(value) : "-";
}

export function describeEggType(egg) {
  switch (egg?.type) {
    case "teleporter":
      return "Teleporter";
    case "teleport-destination":
      return "Teleport Destination";
    case "monster-spawn":
      return "Monster Spawn";
    case "usecode-trigger":
      return "Usecode Trigger";
    case "glob":
      return "Glob Egg";
    default:
      return "Egg";
  }
}

export function eyeIconSvg(hidden) {
  if (hidden) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3.4 5.2C4.8 3.8 6.4 3 8 3c2.8 0 5.3 2.1 6.7 5-0.6 1.2-1.3 2.2-2.2 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6.1a2.4 2.4 0 013.1 3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M1.3 8c0.7-1.3 1.6-2.4 2.6-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.3 8C2.8 5.1 5.2 3 8 3s5.3 2.1 6.7 5c-1.5 2.9-3.9 5-6.7 5S2.8 10.9 1.3 8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/></svg>';
}

export function penIconSvg() {
  return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.9 2.1a1.8 1.8 0 112.5 2.5L6 12H3.5V9.5l7.4-7.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.7 3.3l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
}
