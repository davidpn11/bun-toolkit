import { basename } from "node:path";
import { UsageError } from "../../errors.ts";

export const FORMATS = ["gzip", "zstd", "brotli", "deflate"] as const;
export type Format = (typeof FORMATS)[number];

type Spec = { extension: string; tarExtensions: string[]; min: number; max: number; level: number };

/** Default levels favor size over speed: these are for files you compress once and ship. */
const SPECS: Record<Format, Spec> = {
  gzip: { extension: ".gz", tarExtensions: [".tgz"], min: 1, max: 12, level: 9 },
  zstd: { extension: ".zst", tarExtensions: [".tzst"], min: 1, max: 22, level: 19 },
  brotli: { extension: ".br", tarExtensions: [], min: 0, max: 11, level: 11 },
  deflate: { extension: ".deflate", tarExtensions: [], min: 1, max: 12, level: 9 },
};

export function spec(format: Format): Spec {
  return SPECS[format];
}

export function resolveLevel(format: Format, level: number | undefined): number {
  const { min, max, level: fallback } = SPECS[format];
  if (level === undefined) return fallback;
  if (level < min || level > max) {
    throw new UsageError(`${format} levels go from ${min} to ${max}, not ${level}`, {
      code: "ERR_LEVEL_RANGE",
      hint: `Leave --level out to use ${fallback}`,
    });
  }
  return level;
}

export type Detected = { format: Format; tar: boolean; stem: string };

/** `app.js.gz` → gzip, stem `app.js`; `site.tar.zst` and `site.tzst` → zstd tar, stem `site`. */
export function detectFromName(path: string): Detected | undefined {
  const name = basename(path);
  const lower = name.toLowerCase();
  for (const format of FORMATS) {
    const { extension, tarExtensions } = SPECS[format];
    for (const ext of tarExtensions) {
      if (lower.endsWith(ext)) return { format, tar: true, stem: name.slice(0, -ext.length) };
    }
    if (lower.endsWith(`.tar${extension}`))
      return { format, tar: true, stem: name.slice(0, -`.tar${extension}`.length) };
    if (lower.endsWith(extension)) return { format, tar: false, stem: name.slice(0, -extension.length) };
  }
  return undefined;
}

export function isCompressedPath(path: string): boolean {
  return detectFromName(path) !== undefined;
}

/** gzip and zstd have magic bytes; brotli and raw deflate don't, so those need the extension or --format. */
export function sniffFormat(bytes: Uint8Array): Format | undefined {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return "gzip";
  if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) return "zstd";
  return undefined;
}

export function isTar(bytes: Uint8Array): boolean {
  return bytes.length > 262 && new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar";
}
