import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { UsageError } from "../../errors.ts";
import { collectFiles } from "../../shared/collect.ts";
import { describeFileError, writeFileAtomic } from "../../shared/fs.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import { extractTar, tarLayout } from "./archive.ts";
import { CodecError, decompressBytes } from "./codec.ts";
import type { BatchHooks } from "./compress.ts";
import { detectFromName, type Format, isCompressedPath, isTar, sniffFormat } from "./formats.ts";

export type DecompressPlan = {
  format?: Format | undefined;
  outDir?: string | undefined;
  output?: string | undefined;
  overwrite: boolean;
  dryRun: boolean;
  recursive: boolean;
};

export type DecompressResult = {
  input: string;
  output?: string;
  format?: Format;
  kind?: "file" | "folder";
  status: "done" | "skipped" | "failed";
  before?: number;
  after?: number;
  files?: number;
  reason?: string;
  code?: string;
  hint?: string;
};

export type DecompressReport = {
  results: DecompressResult[];
  totals: { done: number; skipped: number; failed: number };
  missing: string[];
  ignored: string[];
  dryRun: boolean;
  cancelled: boolean;
};

export async function decompressInputs(
  paths: string[],
  cwd: string,
  plan: DecompressPlan,
  hooks: BatchHooks = {},
): Promise<DecompressReport> {
  const named = new Set(paths.map((p) => resolve(cwd, p)));
  const collected = await collectFiles(paths, {
    cwd,
    recursive: plan.recursive,
    accept: (path) => isCompressedPath(path) || named.has(path),
  });
  if (plan.output && collected.files.length > 1) {
    throw new UsageError("-o takes one input; this would write several files", {
      code: "ERR_OUTPUT_MANY",
      hint: "Use --out-dir for several outputs",
    });
  }
  const output = plan.output ? resolve(cwd, plan.output) : undefined;
  hooks.onStart?.(collected.files.length);
  const results: DecompressResult[] = [];
  await runPool(collected.files, defaultConcurrency(), async ({ path }, index) => {
    results[index] = hooks.signal?.aborted
      ? { input: path, status: "skipped", reason: "Cancelled", code: "ERR_CANCELLED" }
      : await decompressFile(path, { ...plan, output });
    hooks.onProgress?.(path);
  });
  const count = (status: DecompressResult["status"]) => results.filter((r) => r.status === status).length;
  return {
    results,
    totals: { done: count("done"), skipped: count("skipped"), failed: count("failed") },
    missing: collected.missing,
    ignored: collected.ignored,
    dryRun: plan.dryRun,
    cancelled: hooks.signal?.aborted === true,
  };
}

export async function decompressFile(path: string, plan: DecompressPlan): Promise<DecompressResult> {
  try {
    const data = await Bun.file(path).bytes();
    const detected = detectFromName(path);
    const format = plan.format ?? detected?.format ?? sniffFormat(data);
    if (!format) {
      return {
        input: path,
        status: "failed",
        reason: "Can't tell how it is compressed",
        code: "ERR_UNKNOWN_FORMAT",
        hint: "Pass --format, e.g. --format brotli",
      };
    }
    const raw = await decompressBytes(data, format);
    const stem = detected?.stem ?? `${basename(path)}.out`;
    const base = { input: path, format, before: data.byteLength, after: raw.byteLength };
    return isTar(raw)
      ? await writeFolder(raw, stem, path, plan, base)
      : await writeFile(raw, stem, path, plan, base);
  } catch (error) {
    const reason = error instanceof CodecError ? error.message : describeFileError(error).reason;
    const hint = error instanceof CodecError ? error.hint : undefined;
    return { input: path, status: "failed", reason, ...(hint && { hint }) };
  }
}

type Base = Pick<DecompressResult, "input" | "format" | "before" | "after">;

async function writeFile(
  raw: Uint8Array,
  stem: string,
  path: string,
  plan: DecompressPlan,
  base: Base,
): Promise<DecompressResult> {
  const output = plan.output ?? join(plan.outDir ?? dirname(path), stem);
  if (existsSync(output) && !plan.overwrite) return skipExisting(base, output, "file");
  if (!plan.dryRun) await writeFileAtomic(output, raw);
  return { ...base, output, kind: "file", status: "done" };
}

async function writeFolder(
  raw: Uint8Array,
  stem: string,
  path: string,
  plan: DecompressPlan,
  base: Base,
): Promise<DecompressResult> {
  const layout = await tarLayout(raw);
  const parent = plan.outDir ?? dirname(path);
  const dest = plan.output ?? (layout.root ? parent : join(parent, stem.replace(/\.tar$/i, "")));
  const output = !plan.output && layout.root ? join(parent, layout.root) : dest;
  if (existsSync(output) && !plan.overwrite) return skipExisting(base, output, "folder");
  if (!plan.dryRun) await extractTar(raw, dest);
  return { ...base, output, kind: "folder", status: "done", files: layout.files };
}

function skipExisting(base: Base, output: string, kind: "file" | "folder"): DecompressResult {
  return {
    ...base,
    output,
    kind,
    status: "skipped",
    reason: `${basename(output)} already exists`,
    code: "SKIP_EXISTS",
    hint: kind === "folder" ? "Pass --overwrite to extract into it anyway" : "Pass --overwrite to replace it",
  };
}
