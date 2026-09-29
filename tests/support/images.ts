import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A 24-bit BMP with a gradient plus pseudo-random noise, so encoders have real work to do
 * (a flat color would compress to almost nothing in every format).
 */
export function noiseBmp(width: number, height: number, seed = 1): Uint8Array {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, row * height, true);
  let state = seed;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const offset = 54 + y * row + x * 3;
      bytes[offset] = Math.floor((x * 255) / width);
      bytes[offset + 1] = Math.floor((y * 255) / height);
      bytes[offset + 2] = state & 0xff;
    }
  }
  return bytes;
}

export type FixtureFormat = "png" | "jpeg" | "webp" | "bmp";

/** Writes a noisy test image in the given format and returns its path. */
export async function writeImage(
  path: string,
  options: { width?: number; height?: number; format?: FixtureFormat; quality?: number; seed?: number } = {},
): Promise<string> {
  const { width = 320, height = 240, format = "png", quality = 90, seed = 1 } = options;
  mkdirSync(dirname(path), { recursive: true });
  const source = noiseBmp(width, height, seed);
  if (format === "bmp") {
    writeFileSync(path, source);
    return path;
  }
  const image = new Bun.Image(source);
  const encoded =
    format === "png" ? image.png() : format === "jpeg" ? image.jpeg({ quality }) : image.webp({ quality });
  await encoded.write(path);
  return path;
}
