import { z } from "zod";
import { LOOPBACK } from "../../shared/serve.ts";

export const portSchema = z.number().int().min(0).max(65535);
export const hostSchema = z.string().min(1);

export const serveConfig = z.object({
  port: portSchema.default(0),
  host: hostSchema.default(LOOPBACK),
  open: z.boolean().default(true),
  spa: z.boolean().default(false),
  cors: z.boolean().default(false),
});

export type ServeConfig = z.infer<typeof serveConfig>;
