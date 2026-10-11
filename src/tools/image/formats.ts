import { extname } from "node:path";

export const OUTPUT_FORMATS = ["webp", "avif", "jpeg", "png", "heic"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const FORMAT_CHOICES = [...OUTPUT_FORMATS, "original"] as const;
export type FormatChoice = (typeof FORMAT_CHOICES)[number];

/** Everything Bun.Image can decode. GIF, BMP and TIFF are decode-only; GIF decodes its first frame. */
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
] as const;

const EXTENSION_FOR: Record<OutputFormat, string> = {
  webp: ".webp",
  avif: ".avif",
  jpeg: ".jpg",
  png: ".png",
  heic: ".heic",
};

export function isImagePath(path: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extname(path).toLowerCase());
}

export function isOutputFormat(format: string): format is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(format);
}

export function extensionFor(format: OutputFormat): string {
  return EXTENSION_FOR[format];
}
