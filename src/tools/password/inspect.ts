import { UsageError } from "../../errors.ts";
import type { Algorithm, HashSettings } from "./config.ts";

export type HashParams = {
  algorithm: Algorithm;
  version?: number;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  cost?: number;
};

export type Inspection = HashParams & {
  /** Ways this hash is weaker than the current settings. Empty when it is as strong or stronger. */
  weaker: string[];
};

const ARGON2 =
  /^\$(argon2id|argon2i|argon2d)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
const BCRYPT = /^\$2[abxy]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export function parseHash(hash: string): HashParams {
  const text = hash.trim();
  const argon = ARGON2.exec(text);
  if (argon) {
    const [, algorithm, version, m, t, p] = argon;
    return {
      algorithm: algorithm as Algorithm,
      version: Number(version),
      memoryCost: Number(m),
      timeCost: Number(t),
      parallelism: Number(p),
    };
  }
  const bcrypt = BCRYPT.exec(text);
  if (bcrypt) return { algorithm: "bcrypt", cost: Number(bcrypt[1]) };
  throw new UsageError("That is not an argon2 or bcrypt hash", {
    code: "ERR_UNSUPPORTED_HASH",
    hint: "Expected $argon2id$v=19$m=…,t=…,p=…$… or $2b$10$…",
  });
}

export function inspectHash(hash: string, settings: HashSettings): Inspection {
  const params = parseHash(hash);
  return { ...params, weaker: weaknesses(params, settings) };
}

function weaknesses(params: HashParams, settings: HashSettings): string[] {
  const found: string[] = [];
  if (params.algorithm !== settings.algorithm)
    found.push(`uses ${params.algorithm}, your settings use ${settings.algorithm}`);
  if (
    params.algorithm === "bcrypt" &&
    settings.algorithm === "bcrypt" &&
    (params.cost ?? 0) < settings.cost
  ) {
    found.push(`cost ${params.cost} is below ${settings.cost}`);
  }
  if (params.algorithm !== "bcrypt" && settings.algorithm !== "bcrypt") {
    if ((params.memoryCost ?? 0) < settings.memoryCost)
      found.push(`memory ${params.memoryCost} KiB is below ${settings.memoryCost} KiB`);
    if ((params.timeCost ?? 0) < settings.timeCost)
      found.push(`${params.timeCost} passes is below ${settings.timeCost}`);
  }
  return found;
}
