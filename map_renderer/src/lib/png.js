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

function clampByte(value) {
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return value;
}

function resolveTranslucentBlendColor(colorIndex, xformBlendMap) {
  if (!xformBlendMap || colorIndex < 0 || colorIndex >= xformBlendMap.length) {
    return null;
  }
  const entry = xformBlendMap[colorIndex];
  if (!entry || entry.a <= 0) {
    return null;
  }
  const alpha = clampByte(entry.a);
  return [
    clampByte(Math.round((entry.r * 255) / alpha)),
    clampByte(Math.round((entry.g * 255) / alpha)),
    clampByte(Math.round((entry.b * 255) / alpha)),
    alpha
  ];
}

function resolveTranslucentRemappedBlendColor(colorIndex, palette, xformBlendMap, xformBlendRgbRemap) {
  const blendedColor = resolveTranslucentBlendColor(colorIndex, xformBlendMap);
  if (!blendedColor) {
    return null;
  }
  if (!xformBlendRgbRemap || colorIndex < 0 || colorIndex >= xformBlendRgbRemap.length) {
    return blendedColor;
  }
  const remappedIndex = xformBlendRgbRemap[colorIndex];
  if (!Number.isInteger(remappedIndex) || remappedIndex < 0 || remappedIndex >= palette.length) {
    return blendedColor;
  }
  const [r, g, b] = palette[remappedIndex];
  return [r, g, b, blendedColor[3]];
}

export function blitFrame(buffer, canvasWidth, canvasHeight, left, top, frame, pixels, palette, flipped, options = {}) {
  const translucent = options.translucent === true;
  const xformBlendMap = options.xformBlendMap ?? null;
  const xformBlendRgbRemap = options.xformBlendRgbRemap ?? null;
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
      const blendedColor = translucent ? resolveTranslucentRemappedBlendColor(colorIndex, palette, xformBlendMap, xformBlendRgbRemap) : null;
      if (blendedColor) {
        buffer[pixelBase] = blendedColor[0];
        buffer[pixelBase + 1] = blendedColor[1];
        buffer[pixelBase + 2] = blendedColor[2];
        buffer[pixelBase + 3] = blendedColor[3];
        continue;
      }
      const [r, g, b] = palette[colorIndex];
      buffer[pixelBase] = r;
      buffer[pixelBase + 1] = g;
      buffer[pixelBase + 2] = b;
      buffer[pixelBase + 3] = 255;
    }
  }
}

export function encodePng(width, height, data) {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}
