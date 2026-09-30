import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { BtkError, ExitCode, UsageError } from "../../errors.ts";
import { type Collected, collectFiles } from "../../shared/collect.ts";
import { writeFileAtomic } from "../../shared/fs.ts";
import { hasPipedStdin, readStdin, STDIN } from "../../shared/stdio.ts";
import { type ConvertConfig, convertConfig, fromSchema, toSchema } from "./config.ts";
import { type ConvertOptions, convertFiles, convertText, type WriteReport } from "./convert.ts";
import { DATA_EXTENSIONS, extensionsOf, INPUT_FORMATS, isDataPath, OUTPUT_FORMATS } from "./formats.ts";
import { renderConvert, renderFormats } from "./render.ts";

export type ConvertResult =
  | { mode: "stdout"; input: string; from: string; to: string; output: string }
  | { mode: "file"; input: string; from: string; to: string; path: string; bytes: number; dryRun: boolean }
  | ({ mode: "batch" } & WriteReport);

type RunInput = {
  inputs: string[];
  to: ConvertOptions["to"];
  from: ConvertOptions["from"];
  indent: number;
  pretty: boolean;
  xmlRoot: string;
  output: string | undefined;
  outDir: string | undefined;
  write: boolean;
  overwrite: boolean;
  recursive: boolean;
  dryRun: boolean;
};

export const run = defineAction({
  description: "Convert between JSON, YAML, TOML, XML, JSON5, JSONC and JSONL",
  examples: [
    "btk convert config.yaml",
    "btk convert data.xml --to yaml",
    "cat logs.jsonl | btk convert --from jsonl --to json",
    "btk convert tsconfig.json --to yaml -o tsconfig.yaml",
    "btk convert ./config -r --to toml --out-dir build",
  ],
  args: {
    inputs: positional(z.array(z.string()).default([]), {
      valueHint: "files",
      description: 'Files, folders or globs; "-" or a pipe reads standard input',
    }),
    to: flag(toSchema, { alias: "t", config: "to", description: "Output format" }),
    from: flag(fromSchema.optional(), {
      alias: "f",
      description: "Input format; taken from the file extension, or detected for JSON, JSONL and XML input",
    }),
    indent: flag(z.number().int().min(0).max(8), { config: "indent", description: "Spaces per level" }),
    pretty: flag(z.boolean(), {
      config: "pretty",
      description: "Indented output; --no-pretty writes it compact",
    }),
    xmlRoot: flag(z.string().regex(/^[A-Za-z_][\w.-]*$/), {
      config: "xmlRoot",
      valueHint: "<name>",
      description: "Root element when the data needs wrapping to become XML",
    }),
    output: flag(z.string().optional(), {
      alias: "o",
      valueHint: "<file>",
      description: "Write the result to this file",
    }),
    outDir: flag(z.string().optional(), {
      config: "outDir",
      valueHint: "<dir>",
      description: "Write files here, mirroring subfolders",
    }),
    write: flag(z.boolean().default(false), {
      alias: "w",
      description: "Write next to each original instead of printing (on by default for several files)",
    }),
    overwrite: flag(z.boolean(), { config: "overwrite", description: "Replace existing files" }),
    recursive: flag(z.boolean(), {
      alias: "r",
      config: "recursive",
      description: "Include files in subfolders",
    }),
    dryRun: flag(z.boolean().default(false), {
      alias: "n",
      description: "Report what would be written, without writing",
    }),
  },
  async run(input, ctx): Promise<ConvertResult> {
    const options = convertOptions(input);
    const stdinWanted = input.inputs.includes(STDIN) || (input.inputs.length === 0 && hasPipedStdin(ctx.io));
    if (stdinWanted) return fromStdin(input, options, ctx);
    if (input.inputs.length === 0) throw nothingToConvert();
    const collected = await collectFiles(input.inputs, {
      cwd: ctx.cwd,
      recursive: input.recursive,
      accept: acceptFor(input, ctx.cwd),
      exclude: input.outDir ? [input.outDir] : [],
    });
    const [only, ...more] = collected.files;
    if (!only) throw noFiles(collected);
    if (input.write || input.outDir || more.length > 0) return writeBatch(collected, options, input, ctx);
    return convertOne(only.path, await Bun.file(only.path).text(), options, input, ctx);
  },
  render: renderConvert,
  exitCode: (result) =>
    result.mode === "batch" && (result.totals.failed > 0 || result.missing.length > 0)
      ? ExitCode.Failure
      : ExitCode.Ok,
});

export const formats = defineAction({
  description: "List the formats convert reads and writes",
  run: () =>
    INPUT_FORMATS.map((name) => ({
      name,
      read: true,
      write: (OUTPUT_FORMATS as readonly string[]).includes(name),
      extensions: extensionsOf(name),
    })),
  render: renderFormats,
});

export const convert = defineTool({
  name: "convert",
  description: "Convert JSON, YAML, TOML, XML and friends",
  config: convertConfig,
  defaultAction: "run",
  actions: { run, formats },
  ui: () => import("./ui/Dashboard.tsx"),
});

export function convertSettings(ctx: BtkContext): ConvertConfig {
  return ctx.config.tools.convert as ConvertConfig;
}

/** Known data extensions; with --from, files named explicitly are read whatever their extension. */
function acceptFor(input: RunInput, cwd: string): (path: string) => boolean {
  if (!input.from) return isDataPath;
  const named = new Set(input.inputs.map((p) => resolve(cwd, p)));
  return (path) => isDataPath(path) || named.has(path);
}

function convertOptions(input: RunInput): ConvertOptions {
  return {
    from: input.from,
    to: input.to,
    indent: input.indent,
    pretty: input.pretty,
    xmlRoot: input.xmlRoot,
  };
}

async function fromStdin(input: RunInput, options: ConvertOptions, ctx: BtkContext): Promise<ConvertResult> {
  if (input.inputs.some((p) => p !== STDIN)) {
    throw new UsageError("Standard input can't be mixed with files", {
      code: "ERR_MIXED_INPUT",
      hint: "Convert them in separate runs",
    });
  }
  if (input.write || input.outDir) {
    throw new UsageError("--write and --out-dir need files, not standard input", {
      code: "ERR_STDIN_WRITE",
      hint: "Use -o <file> to save the result",
    });
  }
  const text = new TextDecoder().decode(await readStdin(ctx.io));
  return convertOne(STDIN, text, options, input, ctx);
}

async function convertOne(
  path: string,
  text: string,
  options: ConvertOptions,
  input: RunInput,
  ctx: BtkContext,
): Promise<ConvertResult> {
  const converted = convertText(text, options, path === STDIN ? undefined : path);
  ctx.reporter.log.info(`${path === STDIN ? "stdin" : basename(path)} · ${converted.from} → ${converted.to}`);
  if (!input.output) return { mode: "stdout", input: path, ...converted };

  const target = resolve(ctx.cwd, input.output);
  if (existsSync(target) && !input.overwrite) {
    throw new BtkError(`${input.output} already exists`, {
      code: "ERR_EXISTS",
      hint: "Pass --overwrite to replace it",
    });
  }
  if (!input.dryRun) await writeFileAtomic(target, converted.output);
  const { from, to, output } = converted;
  return {
    mode: "file",
    input: path,
    from,
    to,
    path: target,
    bytes: Buffer.byteLength(output),
    dryRun: input.dryRun,
  };
}

async function writeBatch(
  collected: Collected,
  options: ConvertOptions,
  input: RunInput,
  ctx: BtkContext,
): Promise<ConvertResult> {
  if (input.output) {
    throw new UsageError("-o takes one input; this matched several files", {
      code: "ERR_OUTPUT_MANY",
      hint: "Use --out-dir for several files",
    });
  }
  ctx.reporter.log.info(`${collected.files.length} files → ${options.to}${input.dryRun ? " (dry run)" : ""}`);
  const outDir = input.outDir ? resolve(ctx.cwd, input.outDir) : undefined;
  const report = await convertFiles(collected, options, {
    outDir,
    overwrite: input.overwrite,
    dryRun: input.dryRun,
  });
  return { mode: "batch", ...report };
}

function nothingToConvert(): UsageError {
  return new UsageError("Nothing to convert", {
    code: "ERR_NO_INPUT",
    hint: "Pass a file, or pipe data in: cat data.yaml | btk convert --to json",
  });
}

function noFiles(collected: Collected): BtkError {
  return new BtkError("No data files found", {
    code: "ERR_NO_FILES",
    details: [
      ...collected.missing.map((p) => `Nothing matched ${p}`),
      ...collected.ignored.map((p) => `${p} has no known data extension`),
    ],
    hint: `Supported: ${DATA_EXTENSIONS.join(", ")}. Use --from to read other files from stdin`,
  });
}
