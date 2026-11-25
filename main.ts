import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576;
const MAX_DIMENSION = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function resolveSourceImage(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'entry.png');
}

function resolveOutputImage(): string {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true, mode: 0o755 });
  return join(outDir, 'entry.png');
}

function validatePngStructure(buf: Buffer): void {
  if (buf.length < 33) {
    throw new Error('PNG buffer is too small to contain IHDR and IEND');
  }
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR') {
    throw new Error(`Expected IHDR chunk first, got ${ihdrType}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`PNG dimensions ${width}x${height} out of allowed 1..${MAX_DIMENSION}`);
  }
  const tail = buf.subarray(buf.length - PNG_IEND.length);
  if (!tail.equals(PNG_IEND)) {
    throw new Error('PNG buffer does not terminate with a valid IEND chunk');
  }
}

function validateJpegStructure(buf: Buffer): void {
  if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    throw new Error('JPEG buffer does not end with EOI marker');
  }
}

function validateImageBytes(buf: Buffer): void {
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    throw new Error(`Image size ${buf.length} exceeds allowed 1..${MAX_BYTES} bytes`);
  }
  if (buf.length >= PNG_SIGNATURE.length && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    validatePngStructure(buf);
    return;
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    validateJpegStructure(buf);
    return;
  }
  throw new Error('Image must be a complete PNG or JPEG file');
}

function main(): void {
  const sourcePath = resolveSourceImage();
  const outputPath = resolveOutputImage();
  const data = readFileSync(sourcePath);
  validateImageBytes(data);
  writeFileSync(outputPath, data, { mode: 0o644 });
  chmodSync(outputPath, 0o644);
}

main();
