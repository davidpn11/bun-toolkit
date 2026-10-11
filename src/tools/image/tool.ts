import { basename } from "node:path";
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { BtkError, ExitCode } from "../../errors.ts";
import { pluralize } from "../../output/format.ts";
import { type Collected, collectImages } from "./collect.ts";
import { dimensionSchema, formatSchema, type ImageConfig, imageConfig, qualitySchema } from "./config.ts";
import { inspectImages } from "./info.ts";
import { type OptimizeReport, optimizeImages } from "./optimize.ts";
import { applyPreset, buildOptions, describeOptions, type OptimizeOptions } from "./options.ts";
import { availablePresets, describePreset, resolvePreset } from "./presets.ts";
import { renderInfo, renderOptimize } from "./render.ts";

const pathsArg = positional(z.array(z.string()).min(1), {
  valueHint: "paths",
  description: 'Image files, folders or quoted globs ("assets/**/*.png")',
});

const recursiveFlag = flag(z.boolean(), {
  alias: "r",
  config: "recursive",
  description: "Include images in subfolders",
});

export const optimize = defineAction({
  description: "Convert and compress images",
  examples: [
    "btk image hero.png",
    "btk image ./assets -r --format avif -q 60",
    "btk image ./photos --preset web --out-dir ./dist/img",
    "btk image logo.png --format png --palette --overwrite",
    "btk image ./assets -r --dry-run --json",
  ],
  args: {
    paths: pathsArg,
    format: flag(formatSchema, {
      alias: "f",
      config: "format",
      description: "Output format; original keeps each file's own format",
    }),
    quality: flag(qualitySchema, {
      alias: "q",
      config: "quality",
      description: "Quality for jpeg, webp, avif and heic",
    }),
    lossless: flag(z.boolean(), { config: "lossless", description: "Lossless WebP" }),
    palette: flag(z.boolean(), {
      config: "palette",
      description: "Reduce PNGs to a 256-color palette (much smaller, lossy)",
    }),
    maxWidth: flag(dimensionSchema.optional(), {
      alias: "w",
      config: "maxWidth",
      description: "Shrink to fit this width, keeping the aspect ratio (never enlarges)",
    }),
    maxHeight: flag(dimensionSchema.optional(), {
      config: "maxHeight",
      description: "Shrink to fit this height, keeping the aspect ratio (never enlarges)",
    }),
    preset: flag(z.string().optional(), {
      alias: "p",
      valueHint: "<web|thumbnail|social>",
      description: "Quality and size preset; explicit flags still win",
    }),
    outDir: flag(z.string().optional(), {
      alias: "o",
      config: "outDir",
      valueHint: "<dir>",
      description: "Write here instead of next to each original, mirroring subfolders",
    }),
    recursive: recursiveFlag,
    overwrite: flag(z.boolean(), {
      config: "overwrite",
      description: "Replace existing outputs, and allow optimizing in place",
    }),
    dryRun: flag(z.boolean().default(false), {
      alias: "n",
      description: "Report what would happen without writing any file",
    }),
  },
  async run(input, ctx, meta): Promise<OptimizeReport> {
    const preset = input.preset ? resolvePreset(input.preset, imageSettings(ctx).presets) : undefined;
    const options = applyPreset(buildOptions(input, ctx.cwd), preset, meta.sources);
    const collected = await collectImages(input.paths, {
      cwd: ctx.cwd,
      recursive: input.recursive,
      exclude: options.outDir ? [options.outDir] : [],
    });
    if (collected.files.length === 0) throw noImages(collected, input.recursive);
    return optimizeWithProgress(collected, options, ctx);
  },
  render: renderOptimize,
  exitCode(report) {
    if (report.cancelled) return ExitCode.Cancelled;
    return report.totals.failed > 0 || report.missing.length > 0 ? ExitCode.Failure : ExitCode.Ok;
  },
});

export const info = defineAction({
  description: "Show format, dimensions and size",
  examples: [
    "btk image info hero.png",
    "btk image info ./assets -r",
    "btk image info hero.png --placeholder --json",
  ],
  args: {
    paths: pathsArg,
    placeholder: flag(z.boolean().default(false), {
      description: "Also compute a ThumbHash blur placeholder (data URL)",
    }),
    recursive: recursiveFlag,
  },
  async run(input, ctx) {
    const collected = await collectImages(input.paths, { cwd: ctx.cwd, recursive: input.recursive });
    if (collected.files.length === 0) throw noImages(collected, input.recursive);
    return inspectImages(collected, { placeholder: input.placeholder });
  },
  render: renderInfo,
  exitCode: (report) =>
    report.failed.length > 0 || report.missing.length > 0 ? ExitCode.Failure : ExitCode.Ok,
});

export const presets = defineAction({
  description: "List presets for --preset, including the ones in your config",
  examples: ["btk image presets"],
  run(_input, ctx) {
    const configured = imageSettings(ctx).presets;
    return Object.entries(availablePresets(configured)).map(([name, preset]) => ({
      name,
      source: name in configured ? "config" : "built-in",
      ...preset,
    }));
  },
  render(rows, out) {
    out.table(
      rows.map(({ name, source, ...preset }) => ({ name, settings: describePreset(preset), source })),
      {
        columns: [
          { key: "name" },
          { key: "settings" },
          { key: "source", paint: (text) => out.style.muted(text) },
        ],
      },
    );
  },
});

export const image = defineTool({
  name: "image",
  description: "Convert, compress and inspect images",
  aliases: ["img"],
  config: imageConfig,
  defaultAction: "optimize",
  actions: { optimize, info, presets },
  ui: () => import("./ui/Dashboard.tsx"),
});

export function imageSettings(ctx: BtkContext): ImageConfig {
  return ctx.config.tools.image as ImageConfig;
}

async function optimizeWithProgress(
  collected: Collected,
  options: OptimizeOptions,
  ctx: BtkContext,
): Promise<OptimizeReport> {
  const { reporter } = ctx;
  const count = pluralize(collected.files.length, "image");
  reporter.log.info(`${options.dryRun ? "Dry run: " : ""}${count} → ${describeOptions(options)}`);
  reporter.progress.start(collected.files.length, "Optimizing");
  try {
    const report = await optimizeImages(collected, options, {
      signal: ctx.signal,
      onProgress: (event) => {
        if (event.type === "done") reporter.progress.tick(1, basename(event.file.path));
      },
    });
    reporter.progress.done(`Processed ${count}`);
    return report;
  } catch (error) {
    reporter.progress.stop();
    throw error;
  }
}

function noImages(collected: Collected, recursive: boolean): BtkError {
  const details = [
    ...collected.missing.map((p) => `Nothing matched ${p}`),
    ...collected.ignored.map((p) => `${p} is not an image file`),
  ];
  return new BtkError("No images found", {
    code: "ERR_NO_IMAGES",
    details,
    hint: recursive
      ? "Supported: jpg, png, webp, avif, heic, gif, bmp, tiff"
      : "Pass image files or folders; add --recursive to include subfolders",
  });
}
