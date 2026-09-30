import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { ExitCode, UsageError } from "../../errors.ts";
import { pluralize } from "../../output/format.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import {
  type Algorithm,
  algorithmSchema,
  bcryptCostSchema,
  type HashSettings,
  memoryCostSchema,
  type PasswordConfig,
  passwordConfig,
  timeCostSchema,
} from "./config.ts";
import { describeSettings, hashPassword, verifyPassword } from "./hashing.ts";
import { type Inspection, inspectHash, parseHash } from "./inspect.ts";
import { renderHash, renderInspect, renderVerify } from "./render.ts";
import { type PasswordSource, readPasswords } from "./secrets.ts";

export type HashReport = {
  algorithm: Algorithm;
  settings: HashSettings;
  source: PasswordSource;
  hashes: string[];
  durationMs: number;
};

export type VerifyReport = { match: boolean; algorithm: Algorithm; weaker: string[] };

export const hash = defineAction({
  description: "Hash passwords with argon2 or bcrypt",
  examples: [
    "btk password hash",
    'echo "$PASSWORD" | btk password hash',
    "btk password hash --algorithm bcrypt --cost 12",
    "cat passwords.txt | btk password hash > hashes.txt",
  ],
  args: {
    passwords: positional(z.array(z.string()).default([]), {
      valueHint: "password",
      description: "Passwords to hash; leave out to type one at a hidden prompt or pipe them in",
    }),
    algorithm: flag(algorithmSchema, { alias: "a", config: "algorithm", description: "Hashing algorithm" }),
    memoryCost: flag(memoryCostSchema, {
      config: "memoryCost",
      valueHint: "<KiB>",
      description: "Argon2 memory in KiB",
    }),
    timeCost: flag(timeCostSchema, { config: "timeCost", description: "Argon2 passes over the memory" }),
    cost: flag(bcryptCostSchema, { config: "cost", description: "bcrypt cost; each step doubles the time" }),
  },
  async run(input, ctx): Promise<HashReport> {
    const settings: HashSettings = {
      algorithm: input.algorithm,
      memoryCost: input.memoryCost,
      timeCost: input.timeCost,
      cost: input.cost,
    };
    const { values, source } = await readPasswords(input.passwords, ctx, true);
    ctx.reporter.log.info(`${describeSettings(settings)} · ${pluralize(values.length, "password")}`);
    const started = performance.now();
    const hashes: string[] = [];
    await runPool(values, defaultConcurrency(), async (value, index) => {
      hashes[index] = (await hashPassword(value, settings)).hash;
    });
    return {
      algorithm: settings.algorithm,
      settings,
      source,
      hashes,
      durationMs: Math.round(performance.now() - started),
    };
  },
  render: renderHash,
});

export const verify = defineAction({
  description: "Check a password against a hash (exits 1 when it doesn't match)",
  examples: [
    "btk password verify '$argon2id$v=19$m=65536,t=2,p=1$…'",
    `echo "$PASSWORD" | btk password verify "$HASH"`,
  ],
  args: {
    hash: positional(z.string(), { description: "The stored argon2 or bcrypt hash" }),
    password: positional(z.string().optional(), {
      description: "Password to check; leave out to type it or pipe it in",
    }),
  },
  async run(input, ctx): Promise<VerifyReport> {
    const params = parseHash(input.hash);
    const { values } = await readPasswords(input.password === undefined ? [] : [input.password], ctx, false);
    if (values.length > 1) {
      throw new UsageError("verify checks one password", {
        code: "ERR_MANY_PASSWORDS",
        hint: "Pipe in a single line",
      });
    }
    const match = await verifyPassword(values[0] ?? "", input.hash);
    const weaker = match ? inspectHash(input.hash, passwordSettings(ctx)).weaker : [];
    return { match, algorithm: params.algorithm, weaker };
  },
  render: renderVerify,
  exitCode: (report) => (report.match ? ExitCode.Ok : ExitCode.Failure),
});

export const inspect = defineAction({
  description: "Show a hash's algorithm and cost, and whether it is weaker than your settings",
  examples: ["btk password inspect '$2b$10$…'"],
  args: { hash: positional(z.string(), { description: "An argon2 or bcrypt hash" }) },
  run: (input, ctx): Inspection => inspectHash(input.hash, passwordSettings(ctx)),
  render: renderInspect,
});

export const password = defineTool({
  name: "password",
  description: "Hash and check passwords",
  aliases: ["pw"],
  config: passwordConfig,
  defaultAction: "hash",
  actions: { hash, verify, inspect },
  ui: () => import("./ui/Dashboard.tsx"),
});

export function passwordSettings(ctx: BtkContext): PasswordConfig {
  return ctx.config.tools.password as PasswordConfig;
}
