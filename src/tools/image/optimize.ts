import { existsSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { reduction } from "../../output/format.ts";
import { writeFileAtomic } from "../../shared/fs.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import type { Collected, ImageFile } from "./collect.ts";
import { describeImageError, type ImageProblem } from "./errors.ts";
import { extensionFor, isOutputFormat, type OutputFormat } from "./formats.ts";
import { type ImageStats, readStats } from "./info.ts";
import type { OptimizeOptions } from "./options.ts";

export type FileStatus = "converted" | "skipped" | "failed";

export type FileResult = {
  input: string;
  output?: string;
  status: FileStatus;
  before?: ImageStats;
  after?: ImageStats;
  savedBytes?: number;
  savedPercent?: number;
  reason?: string;
  code?: string;
  hint?: string;
};

export type OptimizeTotals = {
  converted: number;
  skipped: number;
  failed: number;
  beforeBytes: number;
  afterBytes: number;
  savedBytes: number;
  savedPercent: number;
};

export type OptimizeReport = {
  options: OptimizeOptions;
  files: FileResult[];
  totals: OptimizeTotals;
  missing: string[];
  ignored: string[];
  cancelled: boolean;
  durationMs: number;
};

export type OptimizeProgress = {
  type: "start" | "done";
  index: number;
  file: ImageFile;
  result?: FileResult;
};

export type OptimizeHooks = {
  signal?: AbortSignal;
  onProgress?: (event: OptimizeProgress) => void;
  concurrency?: number;
};

/** Bun.Image resize needs a width; this stands in for "no width limit" with `fit: "inside"`. */
const UNBOUNDED = 0x3fff;

export async function optimizeImages(
  collected: Collected,
  options: OptimizeOptions,
  hooks: OptimizeHooks = {},
): Promise<OptimizeReport> {
  const started = performance.now();
  const files: FileResult[] = [];
  const claimed = new Set<string>();
  const decided = planBatch(collected.files, options);

  await runPool(collected.files, hooks.concurrency ?? defaultConcurrency(), async (file, index) => {
    if (hooks.signal?.aborted) {
      files[index] = { input: file.path, status: "skipped", reason: "Cancelled", code: "ERR_CANCELLED" };
      return;
    }
    hooks.onProgress?.({ type: "start", index, file });
    const result = decided.get(index) ?? (await optimizeImage(file, options, claimed));
    files[index] = result;
    hooks.onProgress?.({ type: "done", index, file, result });
  });

  return {
    options,
    files,
    totals: totalsOf(files),
    missing: collected.missing,
    ignored: collected.ignored,
    cancelled: hooks.signal?.aborted === true,
    durationMs: Math.round(performance.now() - started),
  };
}

/** Most faithful source first, used when several inputs would produce the same output. */
const SOURCE_RANK = [
  ".png",
  ".bmp",
  ".tif",
  ".tiff",
  ".gif",
  ".heic",
  ".heif",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
];

/**
 * Decides up front what can be known from paths alone, so results don't depend on which file
 * finishes first: files that are outputs of an earlier run (`hero.webp` next to `hero.png`) and
 * inputs that would collide on the same output.
 */
export function planBatch(files: readonly ImageFile[], options: OptimizeOptions): Map<number, FileResult> {
  const decided = new Map<number, FileResult>();
  if (options.format === "original") return decided;
  markPreviousOutputs(files, options.format, decided);
  resolveCollisions(files, options.format, options.outDir, decided);
  return decided;
}

function markPreviousOutputs(
  files: readonly ImageFile[],
  format: OutputFormat,
  decided: Map<number, FileResult>,
): void {
  const sourceOf = new Map<string, string>();
  for (const file of files) {
    const sibling = outputPathFor(file, format);
    if (sibling !== file.path) sourceOf.set(sibling, file.path);
  }
  files.forEach((file, index) => {
    const source = sourceOf.get(file.path);
    if (!source) return;
    const reason = `Output of ${basename(source)} from an earlier run`;
    decided.set(index, skip(file.path, reason, "SKIP_PREVIOUS_OUTPUT"));
  });
}

function resolveCollisions(
  files: readonly ImageFile[],
  format: OutputFormat,
  outDir: string | undefined,
  decided: Map<number, FileResult>,
): void {
  const byOutput = new Map<string, number[]>();
  files.forEach((file, index) => {
    if (decided.has(index)) return;
    const output = outputPathFor(file, format, outDir);
    byOutput.set(output, [...(byOutput.get(output) ?? []), index]);
  });
  for (const [output, indexes] of byOutput) {
    if (indexes.length < 2) continue;
    const [winner, ...losers] = indexes.sort((a, b) => sourceRank(files[a]) - sourceRank(files[b]));
    const reason = `${basename(files[winner as number]?.path ?? "")} also becomes ${basename(output)}; converting that one`;
    for (const index of losers)
      decided.set(index, skip(files[index]?.path ?? "", reason, "SKIP_DUPLICATE_OUTPUT"));
  }
}

function sourceRank(file: ImageFile | undefined): number {
  const rank = SOURCE_RANK.indexOf(extname(file?.path ?? "").toLowerCase());
  return rank === -1 ? SOURCE_RANK.length : rank;
}

function skip(input: string, reason: string, code: string): FileResult {
  return { input, status: "skipped", reason, code };
}

/**
 * Converts one image. Never throws: every outcome is a FileResult. `claimed` holds outputs already
 * taken by other inputs in the batch (`a.png` and `a.jpg` would both become `a.webp`).
 */
export async function optimizeImage(
  file: ImageFile,
  options: OptimizeOptions,
  claimed: Set<string> = new Set(),
): Promise<FileResult> {
  let format: string | undefined;
  let output: string | undefined;
  try {
    const before = await readStats(file.path);
    format = options.format === "original" ? before.format : options.format;
    if (!isOutputFormat(format)) return notEncodable(file, before);

    output = outputPathFor(file, format, options.outDir);
    const blocked = checkOutput(file.path, output, options.overwrite, claimed);
    if (blocked) return { input: file.path, output, status: "skipped", before, ...blocked };
    claimed.add(output);

    const { bytes, after } = await encode(file.path, format, options);
    if (wouldGrow(before, after)) {
      return {
        input: file.path,
        output,
        status: "skipped",
        before,
        after,
        reason: "Already optimized. Re-encoding would make it larger",
        code: "SKIP_LARGER",
      };
    }
    if (!options.dryRun) await writeFileAtomic(output, bytes);
    return converted(file.path, output, before, after);
  } catch (error) {
    return {
      input: file.path,
      ...(output && { output }),
      status: "failed",
      ...toReason(describeImageError(error, format)),
    };
  }
}

export function outputPathFor(file: ImageFile, format: OutputFormat, outDir?: string): string {
  const name = basename(file.path, extname(file.path)) + extensionFor(format);
  if (!outDir) return join(dirname(file.path), name);
  return join(outDir, relative(file.base, dirname(file.path)), name);
}

function checkOutput(
  input: string,
  output: string,
  overwrite: boolean,
  claimed: Set<string>,
): Pick<FileResult, "reason" | "code" | "hint"> | undefined {
  if (claimed.has(output)) {
    return {
      reason: `Another image in this batch already writes ${basename(output)}`,
      code: "SKIP_DUPLICATE_OUTPUT",
      hint: "Rename one of them, or convert them in separate runs",
    };
  }
  if (overwrite) return undefined;
  if (output === input) {
    return {
      reason: "Output would replace the original",
      code: "SKIP_IN_PLACE",
      hint: "Pass --overwrite to optimize in place, or --out-dir to write elsewhere",
    };
  }
  if (existsSync(output)) {
    return {
      reason: `${basename(output)} already exists`,
      code: "SKIP_EXISTS",
      hint: "Pass --overwrite to replace it",
    };
  }
  return undefined;
}

async function encode(path: string, format: OutputFormat, options: OptimizeOptions) {
  const image = pipeline(path, format, options);
  const bytes = await image.bytes();
  const after: ImageStats = { format, width: image.width, height: image.height, bytes: bytes.byteLength };
  return { bytes, after };
}

function pipeline(path: string, format: OutputFormat, options: OptimizeOptions): Bun.Image {
  let image = new Bun.Image(path);
  if (options.maxWidth || options.maxHeight) {
    image = image.resize(options.maxWidth ?? UNBOUNDED, options.maxHeight ?? UNBOUNDED, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  switch (format) {
    case "jpeg":
      return image.jpeg({ quality: options.quality, progressive: true });
    case "png":
      return image.png({ compressionLevel: 9, palette: options.palette });
    case "webp":
      return image.webp({ quality: options.quality, lossless: options.lossless });
    case "avif":
      return image.avif({ quality: options.quality });
    case "heic":
      return image.heic({ quality: options.quality });
  }
}

/** Same format and size but more bytes: the original was already better. */
function wouldGrow(before: ImageStats, after: ImageStats): boolean {
  return (
    after.format === before.format &&
    after.width === before.width &&
    after.height === before.height &&
    after.bytes >= before.bytes
  );
}

function converted(input: string, output: string, before: ImageStats, after: ImageStats): FileResult {
  return {
    input,
    output,
    status: "converted",
    before,
    after,
    savedBytes: before.bytes - after.bytes,
    savedPercent: round(reduction(before.bytes, after.bytes)),
  };
}

function notEncodable(file: ImageFile, before: ImageStats): FileResult {
  return {
    input: file.path,
    status: "failed",
    before,
    reason: `${before.format.toUpperCase()} can be read but not written`,
    code: "ERR_IMAGE_NOT_ENCODABLE",
    hint: "Choose an output format, e.g. --format webp",
  };
}

function toReason(problem: ImageProblem): Pick<FileResult, "reason" | "code" | "hint"> {
  return { reason: problem.message, code: problem.code, ...(problem.hint && { hint: problem.hint }) };
}

function totalsOf(files: readonly FileResult[]): OptimizeTotals {
  const done = files.filter((f) => f.status === "converted");
  const beforeBytes = sum(done.map((f) => f.before?.bytes ?? 0));
  const afterBytes = sum(done.map((f) => f.after?.bytes ?? 0));
  return {
    converted: done.length,
    skipped: files.filter((f) => f.status === "skipped").length,
    failed: files.filter((f) => f.status === "failed").length,
    beforeBytes,
    afterBytes,
    savedBytes: beforeBytes - afterBytes,
    savedPercent: round(reduction(beforeBytes, afterBytes)),
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
