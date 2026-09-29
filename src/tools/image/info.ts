import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import type { Collected } from "./collect.ts";
import { describeImageError, type ImageProblem } from "./errors.ts";

export type ImageStats = {
  format: string;
  width: number;
  height: number;
  bytes: number;
};

export type ImageInfo = ImageStats & {
  path: string;
  megapixels: number;
  /** ThumbHash blur placeholder as a data URL. */
  placeholder?: string;
};

export type InfoReport = {
  images: ImageInfo[];
  failed: (ImageProblem & { path: string })[];
  missing: string[];
  ignored: string[];
};

export async function readStats(path: string): Promise<ImageStats> {
  const { width, height, format } = await new Bun.Image(path).metadata();
  return { format, width, height, bytes: Bun.file(path).size };
}

export async function readImageInfo(
  path: string,
  options: { placeholder?: boolean } = {},
): Promise<ImageInfo> {
  const stats = await readStats(path);
  const info: ImageInfo = {
    path,
    ...stats,
    megapixels: Math.round((stats.width * stats.height) / 10_000) / 100,
  };
  if (options.placeholder) info.placeholder = await new Bun.Image(path).placeholder();
  return info;
}

export async function inspectImages(
  collected: Collected,
  options: { placeholder?: boolean } = {},
): Promise<InfoReport> {
  const images: (ImageInfo | undefined)[] = [];
  const failed: InfoReport["failed"] = [];
  await runPool(collected.files, defaultConcurrency(), async ({ path }, index) => {
    try {
      images[index] = await readImageInfo(path, options);
    } catch (error) {
      failed.push({ path, ...describeImageError(error) });
    }
  });
  return {
    images: images.filter((image): image is ImageInfo => image !== undefined),
    failed,
    missing: collected.missing,
    ignored: collected.ignored,
  };
}
