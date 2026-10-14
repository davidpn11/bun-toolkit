import { z } from "zod";
import { DEFAULT_THEME } from "./theme/builtin.ts";
import { themeNameSchema } from "./theme/schema.ts";

export const portSchema = z.number().int().min(0).max(65535);
export const columnsSchema = z.number().int().min(20).max(400);

export const mdConfig = z.object({
  theme: themeNameSchema.default(DEFAULT_THEME),
  /** Extra stylesheet added after the theme's, relative to the working directory. */
  css: z.string().optional(),
  open: z.boolean().default(true),
  port: portSchema.default(0),
  /** Wrap width for terminal output; the terminal's width (up to 100) when unset. */
  columns: columnsSchema.optional(),
  hyperlinks: z.boolean().default(false),
});

export type MdConfig = z.infer<typeof mdConfig>;
