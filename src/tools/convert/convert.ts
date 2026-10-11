import { existsSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import type { Collected, InputFile } from "../../shared/collect.ts";
import { describeFileError, writeFileAtomic } from "../../shared/fs.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import { ConvertError, parse, sniff, stringify, type WriteOptions } from "./codec.ts";
import { extensionFor, formatFromPath, type InputFormat, type OutputFormat } from "./formats.ts";

export type ConvertOptions = WriteOptions & {
  from?: InputFormat | undefined;
  to: OutputFormat;
};

export type Converted = { from: InputFormat; to: OutputFormat; output: string };

export type FileResult = {
  input: string;
  output?: string;
  status: "converted" | "skipped" | "failed";
  from?: InputFormat;
  bytes?: number;
  reason?: string;
  code?: string;
  hint?: string;
};

export type WriteReport = {
  to: OutputFormat;
  files: FileResult[];
  missing: string[];
  ignored: string[];
  totals: { converted: number; skipped: number; failed: number };
  dryRun: boolean;
};

export type WritePlan = { outDir?: string | undefined; overwrite: boolean; dryRun: boolean };

export function detectFormat(text: string, explicit: InputFormat | undefined, path?: string): InputFormat {
  const format = explicit ?? (path ? formatFromPath(path) : undefined) ?? sniff(text);
  if (format) return format;
  throw new ConvertError(
    path ? `Can't tell the format of ${basename(path)}` : "Can't tell the format of the input",
    "Pass --from, e.g. --from yaml",
    "ERR_UNKNOWN_FORMAT",
  );
}

export function convertText(text: string, options: ConvertOptions, path?: string): Converted {
  const from = detectFormat(text, options.from, path);
  return { from, to: options.to, output: stringify(parse(text, from), options.to, options) };
}

export function outputPathFor(file: InputFile, to: OutputFormat, outDir?: string): string {
  const name = basename(file.path, extname(file.path)) + extensionFor(to);
  return outDir
    ? join(outDir, relative(file.base, dirname(file.path)), name)
    : join(dirname(file.path), name);
}

export async function convertFiles(
  collected: Collected,
  options: ConvertOptions,
  plan: WritePlan,
): Promise<WriteReport> {
  const files: FileResult[] = [];
  const previous = previousOutputs(collected.files, options.to);
  const claimed = new Set<string>();
  await runPool(collected.files, defaultConcurrency(), async (file, index) => {
    const source = previous.get(file.path);
    files[index] = source
      ? {
          input: file.path,
          status: "skipped",
          reason: `Output of ${basename(source)} from an earlier run`,
          code: "SKIP_PREVIOUS_OUTPUT",
        }
      : await convertFile(file, options, plan, claimed);
  });
  const count = (status: FileResult["status"]) => files.filter((f) => f.status === status).length;
  return {
    to: options.to,
    files,
    missing: collected.missing,
    ignored: collected.ignored,
    totals: { converted: count("converted"), skipped: count("skipped"), failed: count("failed") },
    dryRun: plan.dryRun,
  };
}

/** `app.json` next to `app.yaml` when converting to JSON: a result of an earlier run, not a source. */
function previousOutputs(files: readonly InputFile[], to: OutputFormat): Map<string, string> {
  const sourceOf = new Map<string, string>();
  for (const file of files) {
    const sibling = outputPathFor(file, to);
    if (sibling !== file.path) sourceOf.set(sibling, file.path);
  }
  return sourceOf;
}

/** Runs its checks before the first await, so with the pool's in-order start the first file in sort order claims an output. */
async function convertFile(
  file: InputFile,
  options: ConvertOptions,
  plan: WritePlan,
  claimed: Set<string>,
): Promise<FileResult> {
  const output = outputPathFor(file, options.to, plan.outDir);
  const blocked = claimed.has(output)
    ? {
        reason: `Another file in this batch already writes ${basename(output)}`,
        code: "SKIP_DUPLICATE_OUTPUT",
      }
    : checkOutput(file.path, output, plan.overwrite);
  if (blocked) return { input: file.path, output, status: "skipped", ...blocked };
  claimed.add(output);
  try {
    const converted = convertText(await Bun.file(file.path).text(), options, file.path);
    if (!plan.dryRun) await writeFileAtomic(output, converted.output);
    return {
      input: file.path,
      output,
      status: "converted",
      from: converted.from,
      bytes: Buffer.byteLength(converted.output),
    };
  } catch (error) {
    return { input: file.path, output, status: "failed", ...failure(error) };
  }
}

function checkOutput(
  input: string,
  output: string,
  overwrite: boolean,
): Pick<FileResult, "reason" | "code" | "hint"> | undefined {
  if (overwrite) return undefined;
  if (output === input) {
    return {
      reason: "Output would replace the original",
      code: "SKIP_IN_PLACE",
      hint: "Pass --overwrite to rewrite it in place, or --out-dir to write elsewhere",
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

function failure(error: unknown): Pick<FileResult, "reason" | "code" | "hint"> {
  if (error instanceof ConvertError)
    return { reason: error.message, code: error.code, ...(error.hint && { hint: error.hint }) };
  const { code, reason } = describeFileError(error);
  return { reason, code };
}
