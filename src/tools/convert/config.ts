import { z } from "zod";
import { INPUT_FORMATS, OUTPUT_FORMATS } from "./formats.ts";

export const fromSchema = z.enum(INPUT_FORMATS);
export const toSchema = z.enum(OUTPUT_FORMATS);

export const convertConfig = z.object({
  to: toSchema.default("json"),
  indent: z.number().int().min(0).max(8).default(2),
  pretty: z.boolean().default(true),
  xmlRoot: z
    .string()
    .regex(/^[A-Za-z_][\w.-]*$/, "Expected an XML element name")
    .default("root"),
  outDir: z.string().optional(),
  recursive: z.boolean().default(false),
  overwrite: z.boolean().default(false),
});

export type ConvertConfig = z.infer<typeof convertConfig>;
