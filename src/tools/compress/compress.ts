import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { UsageError } from "../../errors.ts";
import { reduction } from "../../output/format.ts";
import { collectFiles } from "../../shared/collect.ts";
import { describeFileError, writeFileAtomic } from "../../shared/fs.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import { tarFolder } from "./archive.ts";
import { CodecError, compressBytes } from "./codec.ts";
import { type Format, isCompressedPath, resolveLevel, spec } from "./formats.ts";

export type CompressPlan = {
  formats: Format[];
  level?: number | undefined;
  outDir?: string | undefined;
  output?: string | undefined;
  overwrite: boolean;
  dryRun: boolean;
  each: boolean;
  recursive: boolean;
};

type Job = {
  kind: "file" | "folder";
  input: string;
  base: string;
  format: Format;
  level: number;
  output: string;
};

export type JobResult = {
  input: string;
  output: string;
  kind: "file" | "folder";
  format: Format;
  level: number;
  status: "done" | "skipped" | "failed";
  before?: number;
  after?: number;
  savedPercent?: number;
  files?: number;
  reason?: string;
  code?: string;
  hint?: string;
};

export type Totals = {
  done: number;
  skipped: number;
  failed: number;
  beforeBytes: number;
  afterBytes: number;
  savedPercent: number;
};

export type CompressReport = {
  results: JobResult[];
  totals: Totals;
  missing: string[];
  ignored: string[];
  dryRun: boolean;
  cancelled: boolean;
  durationMs: number;
};

export type BatchHooks = {
  signal?: AbortSignal;
  onStart?: (total: number) => void;
  /** Called once per output as it finishes, in completion order. */
  onProgress?: (input: string) => void;
};

export async function compressInputs(
  paths: string[],
  cwd: string,
  plan: CompressPlan,
  hooks: BatchHooks = {},
): Promise<CompressReport> {
  const started = performance.now();
  const { jobs, missing, ignored } = await planJobs(paths, cwd, plan);
  hooks.onStart?.(jobs.length);
  const results: JobResult[] = [];
  await runPool(jobs, defaultConcurrency(), async (job, index) => {
    results[index] = hooks.signal?.aborted ? cancelledJob(job) : await runJob(job, plan);
    hooks.onProgress?.(job.input);
  });
  return {
    results,
    totals: totalsOf(results),
    missing,
    ignored,
    dryRun: plan.dryRun,
    cancelled: hooks.signal?.aborted === true,
    durationMs: Math.round(performance.now() - started),
  };
}

export async function planJobs(paths: string[], cwd: string, plan: CompressPlan) {
  const folders = plan.each
    ? []
    : paths.map((p) => resolve(cwd, p)).filter((p) => existsSync(p) && statSync(p).isDirectory());
  const rest = plan.each ? paths : paths.filter((p) => !folders.includes(resolve(cwd, p)));
  const collected = await collectFiles(rest, {
    cwd,
    recursive: plan.recursive || plan.each,
    accept: (path) => !isCompressedPath(path),
    exclude: plan.outDir ? [plan.outDir] : [],
  });
  const jobs: Job[] = [];
  for (const format of plan.formats) {
    const level = resolveLevel(format, plan.level);
    for (const folder of folders)
      jobs.push({
        kind: "folder",
        input: folder,
        base: dirname(folder),
        format,
        level,
        output: folderOutput(folder, format, plan),
      });
    for (const file of collected.files)
      jobs.push({
        kind: "file",
        input: file.path,
        base: file.base,
        format,
        level,
        output: fileOutput(file.path, file.base, format, plan),
      });
  }
  if (plan.output) {
    if (jobs.length > 1) {
      throw new UsageError("-o takes one input and one format; this would write several files", {
        code: "ERR_OUTPUT_MANY",
        hint: "Use --out-dir for several outputs",
      });
    }
    if (jobs[0]) jobs[0].output = resolve(cwd, plan.output);
  }
  return { jobs, missing: collected.missing, ignored: collected.ignored };
}

function fileOutput(path: string, base: string, format: Format, plan: CompressPlan): string {
  const name = basename(path) + spec(format).extension;
  return plan.outDir ? join(plan.outDir, relative(base, dirname(path)), name) : join(dirname(path), name);
}

function folderOutput(folder: string, format: Format, plan: CompressPlan): string {
  const name = `${basename(folder)}.tar${spec(format).extension}`;
  return join(plan.outDir ?? dirname(folder), name);
}

function jobBase(job: Job) {
  return { input: job.input, output: job.output, kind: job.kind, format: job.format, level: job.level };
}

function cancelledJob(job: Job): JobResult {
  return { ...jobBase(job), status: "skipped", reason: "Cancelled", code: "ERR_CANCELLED" };
}

async function runJob(job: Job, plan: CompressPlan): Promise<JobResult> {
  const base = jobBase(job);
  if (existsSync(job.output) && !plan.overwrite) {
    return {
      ...base,
      status: "skipped",
      reason: `${basename(job.output)} already exists`,
      code: "SKIP_EXISTS",
      hint: "Pass --overwrite to replace it",
    };
  }
  try {
    const { data, files } = await readInput(job);
    const compressed = await compressBytes(data, job.format, job.level);
    const sizes = {
      before: data.byteLength,
      after: compressed.byteLength,
      savedPercent: round(reduction(data.byteLength, compressed.byteLength)),
    };
    if (job.kind === "file" && compressed.byteLength >= data.byteLength) {
      return {
        ...base,
        ...sizes,
        status: "skipped",
        reason: "Would not get smaller",
        code: "SKIP_NO_GAIN",
        hint: "Files like images, videos and archives are already compressed",
      };
    }
    if (!plan.dryRun) await writeFileAtomic(job.output, compressed);
    return { ...base, ...sizes, status: "done", ...(files !== undefined && { files }) };
  } catch (error) {
    const reason = error instanceof CodecError ? error.message : describeFileError(error).reason;
    return { ...base, status: "failed", reason };
  }
}

async function readInput(job: Job): Promise<{ data: Uint8Array; files?: number }> {
  if (job.kind === "file") return { data: await Bun.file(job.input).bytes() };
  const { tar, files } = await tarFolder(job.input);
  return { data: tar, files };
}

export function totalsOf(results: readonly JobResult[]): Totals {
  const done = results.filter((r) => r.status === "done");
  const beforeBytes = done.reduce((sum, r) => sum + (r.before ?? 0), 0);
  const afterBytes = done.reduce((sum, r) => sum + (r.after ?? 0), 0);
  return {
    done: done.length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    beforeBytes,
    afterBytes,
    savedPercent: round(reduction(beforeBytes, afterBytes)),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
