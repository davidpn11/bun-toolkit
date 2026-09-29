import { resolve } from "node:path";
import type { ValueSource } from "../../cli/args.ts";
import type { Preset } from "./config.ts";
import type { FormatChoice } from "./formats.ts";

export type OptimizeOptions = {
  format: FormatChoice;
  quality: number;
  lossless: boolean;
  palette: boolean;
  maxWidth?: number | undefined;
  maxHeight?: number | undefined;
  outDir?: string | undefined;
  overwrite: boolean;
  dryRun: boolean;
};

/** Normalizes flag or form values; `outDir` becomes absolute. */
export function buildOptions(
  values: Omit<OptimizeOptions, "outDir"> & { outDir?: string | undefined },
  cwd: string,
): OptimizeOptions {
  return {
    format: values.format,
    quality: values.quality,
    lossless: values.lossless,
    palette: values.palette,
    maxWidth: values.maxWidth,
    maxHeight: values.maxHeight,
    outDir: values.outDir ? resolve(cwd, values.outDir) : undefined,
    overwrite: values.overwrite,
    dryRun: values.dryRun,
  };
}

const PRESET_KEYS = ["format", "quality", "lossless", "palette", "maxWidth", "maxHeight"] as const;

/** Precedence: explicit flag > preset > config (env, project, global) > built-in default. */
export function applyPreset(
  options: OptimizeOptions,
  preset: Preset | undefined,
  sources: Partial<Record<string, ValueSource>>,
): OptimizeOptions {
  if (!preset) return options;
  const merged = { ...options };
  for (const key of PRESET_KEYS) {
    if (sources[key] !== "flag" && preset[key] !== undefined) Object.assign(merged, { [key]: preset[key] });
  }
  return merged;
}

export function describeOptions(options: OptimizeOptions): string {
  const parts: string[] = [options.format, compressionLabel(options)];
  if (options.maxWidth || options.maxHeight) {
    parts.push(`fit ${options.maxWidth ?? "∞"}×${options.maxHeight ?? "∞"}`);
  }
  return parts.join(" · ");
}

function compressionLabel(options: OptimizeOptions): string {
  if (options.format === "png") return options.palette ? "palette" : "lossless";
  if (options.format === "webp" && options.lossless) return "lossless";
  return `q${options.quality}`;
}
