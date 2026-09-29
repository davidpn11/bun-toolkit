import { z } from "zod";
import { FORMAT_CHOICES } from "./formats.ts";

export const formatSchema = z.enum(FORMAT_CHOICES);
export const qualitySchema = z.number().int().min(1).max(100);
export const dimensionSchema = z.number().int().positive();

export const presetSchema = z.strictObject({
  format: formatSchema.optional(),
  quality: qualitySchema.optional(),
  lossless: z.boolean().optional(),
  palette: z.boolean().optional(),
  maxWidth: dimensionSchema.optional(),
  maxHeight: dimensionSchema.optional(),
});

export type Preset = z.infer<typeof presetSchema>;

export const imageConfig = z.object({
  format: formatSchema.default("webp"),
  quality: qualitySchema.default(80),
  lossless: z.boolean().default(false),
  palette: z.boolean().default(false),
  maxWidth: dimensionSchema.optional(),
  maxHeight: dimensionSchema.optional(),
  outDir: z.string().optional(),
  recursive: z.boolean().default(false),
  overwrite: z.boolean().default(false),
  /** Extra or overridden presets for `--preset`, e.g. `{ hero: { maxWidth: 2560, quality: 85 } }`. */
  presets: z.record(z.string(), presetSchema).default({}),
});

export type ImageConfig = z.infer<typeof imageConfig>;
