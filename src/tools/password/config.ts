import { z } from "zod";

export const ALGORITHMS = ["argon2id", "argon2i", "argon2d", "bcrypt"] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

export const algorithmSchema = z.enum(ALGORITHMS);
export const memoryCostSchema = z.number().int().min(8).max(4_194_304);
export const timeCostSchema = z.number().int().min(1).max(100);
export const bcryptCostSchema = z.number().int().min(4).max(31);

export const passwordConfig = z.object({
  algorithm: algorithmSchema.default("argon2id"),
  /** Argon2 memory in KiB. Bun's default, 64 MiB. */
  memoryCost: memoryCostSchema.default(65_536),
  timeCost: timeCostSchema.default(2),
  /** bcrypt work factor: each step doubles the time. */
  cost: bcryptCostSchema.default(10),
});

export type PasswordConfig = z.infer<typeof passwordConfig>;
export type HashSettings = Pick<PasswordConfig, "algorithm" | "memoryCost" | "timeCost" | "cost">;
