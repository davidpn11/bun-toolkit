import { basename, resolve } from "node:path";
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { BtkError, ExitCode, UsageError } from "../../errors.ts";
import { writeFileAtomic } from "../../shared/fs.ts";
import { hasPipedStdin, readStdin, STDIN } from "../../shared/stdio.ts";
import { compressBytes, decompressBytes } from "./codec.ts";
import { type BatchHooks, type CompressPlan, type CompressReport, compressInputs } from "./compress.ts";
import { type CompressConfig, compressConfig, formatSchema, levelSchema } from "./config.ts";
import { type DecompressReport, decompressInputs } from "./decompress.ts";
import { detectFromName, FORMATS, type Format, resolveLevel, sniffFormat, spec } from "./formats.ts";
import { renderCompress, renderDecompress, renderFormats } from "./render.ts";

export type StreamResult = {
  mode: "stream";
  format: Format;
  before: number;
  after: number;
  path?: string;
  data: Uint8Array;
};
export type CompressResult = StreamResult | ({ mode: "batch" } & CompressReport);
export type DecompressResult = StreamResult | ({ mode: "batch" } & DecompressReport);

const inputsArg = positional(z.array(z.string()).default([]), {
  valueHint: "files",
  description: 'Files, folders or globs; "-" or a pipe reads standard input',
});
const shortcut = (format: Format) =>
  flag(z.boolean().default(false), {
    description: `Use ${format}; combine several to write one file per format`,
  });

export const compressRun = defineAction({
  description: "Compress files, or pack a folder into one archive",
  examples: [
    "btk compress bundle.js",
    "btk compress ./dist --each --gzip --brotli",
    "btk compress ./site --zstd",
    "btk compress styles.css --brotli --level 9",
    "cat dump.sql | btk compress --zstd > dump.sql.zst",
  ],
  args: {
    inputs: inputsArg,
    format: flag(formatSchema, {
      alias: "f",
      config: "format",
      description: "Format when no shortcut flag is given",
    }),
    gzip: shortcut("gzip"),
    zstd: shortcut("zstd"),
    brotli: shortcut("brotli"),
    deflate: shortcut("deflate"),
    level: flag(levelSchema.optional(), {
      alias: "l",
      config: "level",
      description: "Compression level; the range depends on the format",
    }),
    output: flag(z.string().optional(), {
      alias: "o",
      valueHint: "<file>",
      description: "Write the result to this path (one input, one format)",
    }),
    outDir: flag(z.string().optional(), {
      config: "outDir",
      valueHint: "<dir>",
      description: "Write results here instead of next to each input",
    }),
    each: flag(z.boolean().default(false), {
      description: "Compress every file inside folders instead of packing each folder into a .tar",
    }),
    recursive: flag(z.boolean(), {
      alias: "r",
      config: "recursive",
      description: "Include subfolders of folders given with --each or globs",
    }),
    overwrite: flag(z.boolean(), { config: "overwrite", description: "Replace existing outputs" }),
    dryRun: flag(z.boolean().default(false), {
      alias: "n",
      description: "Report sizes without writing anything",
    }),
  },
  async run(input, ctx): Promise<CompressResult> {
    const formats = chosenFormats(input);
    if (streamWanted(input.inputs, ctx)) return compressStream(formats, input.level, input.output, ctx);
    if (input.inputs.length === 0)
      throw nothingGiven("compress", "cat file | btk compress --zstd > file.zst");
    const plan: CompressPlan = {
      formats,
      level: input.level,
      outDir: input.outDir ? resolve(ctx.cwd, input.outDir) : undefined,
      output: input.output,
      overwrite: input.overwrite,
      dryRun: input.dryRun,
      each: input.each,
      recursive: input.recursive,
    };
    ctx.reporter.log.info(
      `${formats.map((f) => `${f} ${resolveLevel(f, input.level)}`).join(" + ")}${input.dryRun ? " · dry run" : ""}`,
    );
    const report = await withProgress(ctx, "Compressing", (hooks) =>
      compressInputs(input.inputs, ctx.cwd, plan, hooks),
    );
    if (report.results.length === 0)
      throw noFiles(report.missing, report.ignored, "Already compressed files are left out");
    return { mode: "batch", ...report };
  },
  render: renderCompress,
  exitCode: batchExitCode,
});

export const formats = defineAction({
  description: "List the formats with their extensions and level ranges",
  run: () =>
    FORMATS.map((name) => ({
      name,
      extension: spec(name).extension,
      min: spec(name).min,
      max: spec(name).max,
      level: spec(name).level,
    })),
  render: renderFormats,
});

export const compress = defineTool({
  name: "compress",
  description: "Compress files and folders",
  config: compressConfig,
  defaultAction: "run",
  actions: { run: compressRun, formats },
  ui: () => import("./ui/Dashboard.tsx"),
});

export const decompressRun = defineAction({
  description: "Decompress files; archives (.tar.gz, .tgz, .tar.zst …) are extracted into a folder",
  examples: [
    "btk decompress bundle.js.gz",
    "btk decompress site.tar.zst",
    "btk decompress logs.gz --stdout | grep ERROR",
    "cat dump.sql.zst | btk decompress > dump.sql",
  ],
  args: {
    inputs: inputsArg,
    format: flag(formatSchema.optional(), {
      alias: "f",
      description: "Format; taken from the extension or the file's first bytes when omitted",
    }),
    output: flag(z.string().optional(), {
      alias: "o",
      valueHint: "<path>",
      description: "Write the file or extract the archive here (one input)",
    }),
    outDir: flag(z.string().optional(), {
      valueHint: "<dir>",
      description: "Write results here instead of next to each input",
    }),
    stdout: flag(z.boolean().default(false), {
      alias: "c",
      description: "Print the decompressed data instead of writing a file (one input)",
    }),
    recursive: flag(z.boolean().default(false), {
      alias: "r",
      description: "Include compressed files in subfolders",
    }),
    overwrite: flag(z.boolean().default(false), {
      description: "Replace existing files, or extract into an existing folder",
    }),
    dryRun: flag(z.boolean().default(false), {
      alias: "n",
      description: "Report what would be written without writing",
    }),
  },
  async run(input, ctx): Promise<DecompressResult> {
    if (streamWanted(input.inputs, ctx)) {
      checkStreamTarget(input.output, ctx, false);
      return decompressStream(await readStdin(ctx.io), input.format, input.output, ctx);
    }
    if (input.inputs.length === 0) throw nothingGiven("decompress", "cat file.zst | btk decompress > file");
    if (input.stdout) return decompressOneToStdout(input.inputs, input.format, ctx);
    const plan = {
      format: input.format,
      outDir: input.outDir ? resolve(ctx.cwd, input.outDir) : undefined,
      output: input.output,
      overwrite: input.overwrite,
      dryRun: input.dryRun,
      recursive: input.recursive,
    };
    const report = await withProgress(ctx, "Decompressing", (hooks) =>
      decompressInputs(input.inputs, ctx.cwd, plan, hooks),
    );
    if (report.results.length === 0)
      throw noFiles(report.missing, report.ignored, "Pass --format to read a file with another extension");
    return { mode: "batch", ...report };
  },
  render: renderDecompress,
  exitCode: batchExitCode,
});

export const decompress = defineTool({
  name: "decompress",
  description: "Decompress files and extract archives",
  defaultAction: "run",
  actions: { run: decompressRun },
  ui: () => import("./ui/DecompressDashboard.tsx"),
});

export function compressSettings(ctx: BtkContext): CompressConfig {
  return ctx.config.tools.compress as CompressConfig;
}

function chosenFormats(input: Record<Format, boolean> & { format: Format }): Format[] {
  const picked = FORMATS.filter((format) => input[format]);
  return picked.length > 0 ? picked : [input.format];
}

function streamWanted(inputs: string[], ctx: BtkContext): boolean {
  return inputs.includes(STDIN) || (inputs.length === 0 && hasPipedStdin(ctx.io));
}

async function compressStream(
  formats: Format[],
  level: number | undefined,
  output: string | undefined,
  ctx: BtkContext,
): Promise<StreamResult> {
  const [format, ...more] = formats;
  if (!format || more.length > 0)
    throw new UsageError("Standard input takes one format", { code: "ERR_MANY_FORMATS" });
  checkStreamTarget(output, ctx, true);
  const data = await readStdin(ctx.io);
  const compressed = await compressBytes(data, format, resolveLevel(format, level));
  return deliver(
    { mode: "stream", format, before: data.byteLength, after: compressed.byteLength, data: compressed },
    output,
    ctx,
  );
}

async function decompressStream(
  data: Uint8Array,
  forced: Format | undefined,
  output: string | undefined,
  ctx: BtkContext,
): Promise<StreamResult> {
  const format = forced ?? sniffFormat(data);
  if (!format) {
    throw new BtkError("Can't tell how the input is compressed", {
      code: "ERR_UNKNOWN_FORMAT",
      hint: "Pass --format, e.g. --format brotli",
    });
  }
  const raw = await decompressBytes(data, format);
  return deliver(
    { mode: "stream", format, before: data.byteLength, after: raw.byteLength, data: raw },
    output,
    ctx,
  );
}

async function decompressOneToStdout(
  inputs: string[],
  forced: Format | undefined,
  ctx: BtkContext,
): Promise<StreamResult> {
  const [only, ...more] = inputs;
  if (!only || more.length > 0) throw new UsageError("--stdout takes one file", { code: "ERR_STDOUT_MANY" });
  checkStreamTarget(undefined, ctx, false);
  const path = resolve(ctx.cwd, only);
  const file = Bun.file(path);
  if (!(await file.exists())) throw new BtkError(`File not found: ${only}`, { code: "ENOENT" });
  const detected = forced ?? detectFromName(path)?.format;
  return decompressStream(await file.bytes(), detected, undefined, ctx);
}

/** Runs before any input is read. Without `-o` the bytes go to stdout, so not into JSON or, compressed, a terminal. */
function checkStreamTarget(output: string | undefined, ctx: BtkContext, binary: boolean): void {
  if (output) return;
  if (ctx.outputMode === "json") {
    throw new UsageError("Binary data can't go in a JSON document", {
      code: "ERR_JSON_BINARY",
      hint: "Use -o <file> with --json",
    });
  }
  if (binary && ctx.io.stdout.isTTY) {
    throw new UsageError("Refusing to print compressed data to the terminal", {
      code: "ERR_BINARY_TTY",
      hint: "Redirect it (> file.zst) or pass -o <file>",
    });
  }
}

async function deliver(
  result: StreamResult,
  output: string | undefined,
  ctx: BtkContext,
): Promise<StreamResult> {
  if (!output) return result;
  const path = resolve(ctx.cwd, output);
  await writeFileAtomic(path, result.data);
  return { ...result, path };
}

async function withProgress<R>(
  ctx: BtkContext,
  label: string,
  work: (hooks: BatchHooks) => Promise<R>,
): Promise<R> {
  const { progress } = ctx.reporter;
  try {
    const report = await work({
      signal: ctx.signal,
      onStart: (total) => progress.start(total, label),
      onProgress: (input) => progress.tick(1, basename(input)),
    });
    progress.done();
    return report;
  } catch (error) {
    progress.stop();
    throw error;
  }
}

function batchExitCode(result: CompressResult | DecompressResult): ExitCode {
  if (result.mode === "stream") return ExitCode.Ok;
  if (result.cancelled) return ExitCode.Cancelled;
  return result.totals.failed > 0 || result.missing.length > 0 ? ExitCode.Failure : ExitCode.Ok;
}

function nothingGiven(command: string, example: string): UsageError {
  return new UsageError(`Nothing to ${command}`, {
    code: "ERR_NO_INPUT",
    hint: `Pass files, or pipe data in: ${example}`,
  });
}

function noFiles(missing: string[], ignored: string[], hint: string): BtkError {
  return new BtkError("No files to work on", {
    code: "ERR_NO_FILES",
    details: [...missing.map((p) => `Nothing matched ${p}`), ...ignored.map((p) => `Left out ${p}`)],
    hint,
  });
}
