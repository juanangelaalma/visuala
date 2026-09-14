import type { AssetMimeType } from "../../domain/ai-service/assets";

export type ParsedImage = { mimeType: AssetMimeType; width: number; height: number };

export function parseImage(bytes: Uint8Array): ParsedImage | undefined {
  if (matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return parsePng(bytes);
  if (matches(bytes, [255, 216])) return parseJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return parseWebp(bytes);
}

function parsePng(bytes: Uint8Array): ParsedImage | undefined {
  if (bytes.length < 45 || ascii(bytes, 12, 4) !== "IHDR") return;
  const end = findPngEnd(bytes);
  if (end !== bytes.length) return;
  return dimensions("image/png", readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function findPngEnd(bytes: Uint8Array): number | undefined {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return;
    if (ascii(bytes, offset + 4, 4) === "IEND") return length === 0 ? end : undefined;
    offset = end;
  }
}

function parseJpeg(bytes: Uint8Array): ParsedImage | undefined {
  let offset = 2;
  let image: ParsedImage | undefined;
  while (offset < bytes.length) {
    if (bytes[offset] !== 255) return;
    const marker = bytes[offset + 1];
    if (marker === 217) return offset + 2 === bytes.length ? image : undefined;
    if (marker === 218) return hasTerminalJpegEnd(bytes, offset) ? image : undefined;
    const length = readUint16BE(bytes, offset + 2);
    if (!length || length < 2 || offset + 2 + length > bytes.length) return;
    if (isStartOfFrame(marker)) image = parseJpegDimensions(bytes, offset);
    offset += length + 2;
  }
}

function hasTerminalJpegEnd(bytes: Uint8Array, scanOffset: number): boolean {
  const length = readUint16BE(bytes, scanOffset + 2);
  return Boolean(length && scanOffset + 2 + length <= bytes.length - 2 && bytes.at(-2) === 255 && bytes.at(-1) === 217);
}

function isStartOfFrame(marker: number | undefined) { return marker !== undefined && marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker); }
function parseJpegDimensions(bytes: Uint8Array, offset: number) {
  const width = readUint16BE(bytes, offset + 7);
  const height = readUint16BE(bytes, offset + 5);
  return width === undefined || height === undefined ? undefined : dimensions("image/jpeg", width, height);
}

function parseWebp(bytes: Uint8Array): ParsedImage | undefined {
  if (bytes.length < 20 || readUint32LE(bytes, 4) + 8 !== bytes.length) return;
  const format = ascii(bytes, 12, 4);
  if (format === "VP8X") return parseVp8x(bytes);
  const chunkSize = readUint32LE(bytes, 16);
  if (20 + chunkSize > bytes.length) return;
  if (format === "VP8L" && chunkSize >= 5 && bytes[20] === 47) return parseVp8l(bytes);
  if (format === "VP8 " && chunkSize >= 10 && matches(bytes.slice(23), [157, 1, 42])) return dimensions("image/webp", readUint16LE(bytes, 26) & 0x3fff, readUint16LE(bytes, 28) & 0x3fff);
}

function parseVp8x(bytes: Uint8Array) {
  if (bytes.length < 30 || readUint32LE(bytes, 16) !== 10) return;
  return dimensions("image/webp", readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
}

function parseVp8l(bytes: Uint8Array) {
  const bits = readUint32LE(bytes, 21);
  return dimensions("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
}

function dimensions(mimeType: AssetMimeType, width: number, height: number) { return width > 0 && height > 0 ? { mimeType, width, height } : undefined; }
function matches(bytes: Uint8Array, signature: number[]) { return signature.every((value, index) => bytes[index] === value); }
function ascii(bytes: Uint8Array, offset: number, length: number) { return String.fromCharCode(...bytes.slice(offset, offset + length)); }
function readUint16BE(bytes: Uint8Array, offset: number) { return offset + 2 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0) : undefined; }
function readUint16LE(bytes: Uint8Array, offset: number) { return offset + 2 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true) : 0; }
function readUint24LE(bytes: Uint8Array, offset: number) { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16); }
function readUint32BE(bytes: Uint8Array, offset: number) { return offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0) : 0; }
function readUint32LE(bytes: Uint8Array, offset: number) { return offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) : 0; }
