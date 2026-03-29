export function readU16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

export function readU24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

export function readU32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

export function readI32LE(buffer, offset) {
  return buffer.readInt32LE(offset);
}
