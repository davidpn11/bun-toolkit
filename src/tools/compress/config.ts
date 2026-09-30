import { z } from "zod";
import { FORMATS } from "./formats.ts";

export const formatSchema = z.enum(FORMATS);
export const levelSchema = z.number().int().min(0).max(22);

export const compressConfig = z.object({
  format: formatSchema.default("gzip"),
  /** Leave unset to use each format's own default (gzip 9, zstd 19, brotli 11, deflate 9). */
  level: levelSchema.optional(),
  outDir: z.string().optional(),
  recursive: z.boolean().default(false),
  overwrite: z.boolean().default(false),
});

export type CompressConfig = z.infer<typeof compressConfig>;
