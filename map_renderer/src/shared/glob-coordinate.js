export const GLOB_COORD_BLOCK_SIZE = 0x400;
export const GLOB_COORD_MASK = ~(GLOB_COORD_BLOCK_SIZE - 1);

export function getGlobOriginDelta(before, after) {
  return {
    x: (after.x & GLOB_COORD_MASK) - (before.x & GLOB_COORD_MASK),
    y: (after.y & GLOB_COORD_MASK) - (before.y & GLOB_COORD_MASK),
    z: after.z - before.z
  };
}

export function translateGlobChildPosition(position, delta) {
  return {
    x: position.x + delta.x,
    y: position.y + delta.y,
    z: position.z + delta.z
  };
}

export function quantizeGlobAxisDelta(axis, delta) {
  if (axis === "z") {
    return Math.round(delta);
  }
  if (axis !== "x" && axis !== "y") {
    return 0;
  }
  const blocks = Math.sign(delta) * Math.floor(Math.abs(delta) / GLOB_COORD_BLOCK_SIZE + 0.5);
  return blocks * GLOB_COORD_BLOCK_SIZE;
}