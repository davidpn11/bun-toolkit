import { z } from "zod";
import { ALGORITHMS } from "./algorithms.ts";
import { ENCODINGS } from "./digest.ts";

export const algorithmSchema = z.enum(ALGORITHMS);
export const encodingSchema = z.enum(ENCODINGS);

export const hashConfig = z.object({
  algorithm: algorithmSchema.default("sha256"),
  encoding: encodingSchema.default("hex"),
  recursive: z.boolean().default(false),
});

export type HashConfig = z.infer<typeof hashConfig>;
