import { PNG } from "pngjs";

export const DEFAULT_BACKGROUND = [10, 12, 18, 255];

export function rgbaBuffer(width, height, color = DEFAULT_BACKGROUND) {
  const [r, g, b, a] = color;
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = a;
  }
  return pixels;
}

function resolveTranslucentColor(colorIndex, palette, xformRemap) {
  if (!xformRemap || colorIndex < 0 || colorIndex >= xformRemap.length) {
    return null;
  }
  const remappedIndex = xformRemap[colorIndex];
  if (!Number.isInteger(remappedIndex) || remappedIndex < 0 || remappedIndex >= palette.length) {
    return null;
  }
  const [r, g, b] = palette[remappedIndex];
  return [r, g, b, 176];
}

export function blitFrame(buffer, canvasWidth, canvasHeight, left, top, frame, pixels, palette, flipped, options = {}) {
  const translucent = options.translucent === true;
  const xformRemap = options.xformRemap ?? null;
  for (let srcY = 0; srcY < frame.height; srcY += 1) {
    const dstY = top + srcY;
    if (dstY < 0 || dstY >= canvasHeight) {
      continue;
    }
    const rowBase = srcY * frame.width;
    for (let srcX = 0; srcX < frame.width; srcX += 1) {
      const pixelIndex = rowBase + (flipped ? frame.width - 1 - srcX : srcX);
      const colorIndex = pixels[pixelIndex];
      if (colorIndex < 0) {
        continue;
      }
      const dstX = left + srcX;
      if (dstX < 0 || dstX >= canvasWidth) {
        continue;
      }
      const pixelBase = (dstY * canvasWidth + dstX) * 4;
      const translucentColor = translucent ? resolveTranslucentColor(colorIndex, palette, xformRemap) : null;
      if (translucentColor) {
        buffer[pixelBase] = translucentColor[0];
        buffer[pixelBase + 1] = translucentColor[1];
        buffer[pixelBase + 2] = translucentColor[2];
        buffer[pixelBase + 3] = translucentColor[3];
        continue;
      }
      const [r, g, b] = palette[colorIndex];
      buffer[pixelBase] = r;
      buffer[pixelBase + 1] = g;
      buffer[pixelBase + 2] = b;
      buffer[pixelBase + 3] = translucent ? 176 : 255;
    }
  }
}

export function encodePng(width, height, data) {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}
