import { ATLAS_MAX_SIZE } from "../config.js";

function createAtlas(index, maxSize, padding) {
  return {
    id: `atlas-${index}`,
    maxSize,
    padding,
    width: 0,
    height: 0,
    cursorX: padding,
    cursorY: padding,
    shelfHeight: 0,
    sprites: []
  };
}

function finalizeAtlas(atlas) {
  return {
    id: atlas.id,
    width: Math.max(1, atlas.width + atlas.padding),
    height: Math.max(1, atlas.height + atlas.padding),
    sprites: atlas.sprites
  };
}

function tryPlaceSprite(atlas, sprite) {
  const paddedWidth = sprite.width + atlas.padding;
  const paddedHeight = sprite.height + atlas.padding;

  if (paddedWidth + atlas.padding > atlas.maxSize || paddedHeight + atlas.padding > atlas.maxSize) {
    throw new Error(`Sprite ${sprite.id} exceeds atlas limit ${atlas.maxSize}`);
  }

  if (atlas.cursorX + sprite.width > atlas.maxSize - atlas.padding) {
    atlas.cursorX = atlas.padding;
    atlas.cursorY += atlas.shelfHeight + atlas.padding;
    atlas.shelfHeight = 0;
  }

  if (atlas.cursorY + sprite.height > atlas.maxSize - atlas.padding) {
    return null;
  }

  const placed = {
    id: sprite.id,
    x: atlas.cursorX,
    y: atlas.cursorY,
    width: sprite.width,
    height: sprite.height
  };

  atlas.sprites.push(placed);
  atlas.width = Math.max(atlas.width, atlas.cursorX + sprite.width);
  atlas.height = Math.max(atlas.height, atlas.cursorY + sprite.height);
  atlas.cursorX += paddedWidth;
  atlas.shelfHeight = Math.max(atlas.shelfHeight, paddedHeight);
  return placed;
}

export function packSprites(rawSprites, options = {}) {
  const maxAtlasSize = options.maxAtlasSize ?? ATLAS_MAX_SIZE;
  const padding = options.padding ?? 1;
  const sprites = [...rawSprites].sort((left, right) => {
    const leftMax = Math.max(left.width, left.height);
    const rightMax = Math.max(right.width, right.height);
    if (leftMax !== rightMax) {
      return rightMax - leftMax;
    }
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;
    if (leftArea !== rightArea) {
      return rightArea - leftArea;
    }
    return left.id.localeCompare(right.id);
  });

  const atlases = [];
  const placements = new Map();
  let atlas = createAtlas(0, maxAtlasSize, padding);

  for (const sprite of sprites) {
    let placed = tryPlaceSprite(atlas, sprite);
    if (!placed) {
      atlases.push(finalizeAtlas(atlas));
      atlas = createAtlas(atlases.length, maxAtlasSize, padding);
      placed = tryPlaceSprite(atlas, sprite);
    }
    placements.set(sprite.id, {
      atlasId: atlas.id,
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height
    });
  }

  if (atlas.sprites.length || atlases.length === 0) {
    atlases.push(finalizeAtlas(atlas));
  }

  return {
    atlases,
    placements
  };
}