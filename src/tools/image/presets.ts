import { suggest } from "../../cli/suggest.ts";
import { UsageError } from "../../errors.ts";
import type { Preset } from "./config.ts";

export const BUILT_IN_PRESETS: Record<string, Preset> = {
  web: { quality: 75, maxWidth: 1920 },
  thumbnail: { quality: 60, maxWidth: 400, maxHeight: 400 },
  social: { quality: 80, maxWidth: 1200, maxHeight: 1200 },
};

export function availablePresets(configured: Record<string, Preset> = {}): Record<string, Preset> {
  return { ...BUILT_IN_PRESETS, ...configured };
}

export function resolvePreset(name: string, configured: Record<string, Preset> = {}): Preset {
  const presets = availablePresets(configured);
  const preset = presets[name];
  if (preset) return preset;
  const match = suggest(name, Object.keys(presets));
  throw new UsageError(`Unknown preset "${name}"`, {
    code: "ERR_UNKNOWN_PRESET",
    hint: match ? `Did you mean "${match}"?` : `Available presets: ${Object.keys(presets).join(", ")}`,
  });
}

export function describePreset(preset: Preset): string {
  const parts: string[] = [];
  if (preset.format) parts.push(preset.format);
  if (preset.quality !== undefined) parts.push(`q${preset.quality}`);
  if (preset.lossless) parts.push("lossless");
  if (preset.palette) parts.push("palette");
  if (preset.maxWidth || preset.maxHeight)
    parts.push(`fit ${preset.maxWidth ?? "∞"}×${preset.maxHeight ?? "∞"}`);
  return parts.join(" · ");
}
