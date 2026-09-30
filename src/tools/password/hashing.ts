import { UsageError } from "../../errors.ts";
import type { HashSettings } from "./config.ts";

export type HashedPassword = { hash: string; ms: number };

export function bunOptions(
  settings: HashSettings,
): Bun.Password.Argon2Algorithm | Bun.Password.BCryptAlgorithm {
  if (settings.algorithm === "bcrypt") return { algorithm: "bcrypt", cost: settings.cost };
  return { algorithm: settings.algorithm, memoryCost: settings.memoryCost, timeCost: settings.timeCost };
}

export async function hashPassword(value: string, settings: HashSettings): Promise<HashedPassword> {
  if (value === "") throw new UsageError("The password is empty", { code: "ERR_EMPTY_PASSWORD" });
  const started = performance.now();
  const hash = await Bun.password.hash(value, bunOptions(settings));
  return { hash, ms: Math.round(performance.now() - started) };
}

export async function verifyPassword(value: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(value, hash.trim());
  } catch {
    throw new UsageError("That is not a password hash btk can check", {
      code: "ERR_UNSUPPORTED_HASH",
      hint: "Supported: argon2id, argon2i and argon2d ($argon2…$), and bcrypt ($2a$, $2b$, $2y$)",
    });
  }
}

export function describeSettings(settings: HashSettings): string {
  if (settings.algorithm === "bcrypt") return `bcrypt · cost ${settings.cost}`;
  return `${settings.algorithm} · ${memory(settings.memoryCost)} · ${settings.timeCost} passes`;
}

function memory(kib: number): string {
  return kib < 1024 ? `${kib} KiB` : `${Math.round(kib / 1024)} MiB`;
}
