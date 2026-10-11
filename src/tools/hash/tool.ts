import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { BtkError, ExitCode, UsageError } from "../../errors.ts";
import { formatBytes, pluralize } from "../../output/format.ts";
import { collectFiles } from "../../shared/collect.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import { hasPipedStdin, isStdoutFile, readStdin, STDIN } from "../../shared/stdio.ts";
import { ALGORITHMS, type Algorithm, algorithmInfo, isAlgorithm } from "./algorithms.ts";
import { type HashReport, type HashSource, hashAll } from "./compute.ts";
import { algorithmSchema, encodingSchema, type HashConfig, hashConfig } from "./config.ts";
import { assertHmacSupported, type DigestOptions } from "./digest.ts";
import { renderAlgorithms, renderCheck, renderCompute, renderVerify } from "./render.ts";
import { parseSums, type VerifyResult, verifyInput } from "./verify.ts";

const hmacKeyFlag = flag(z.string().min(1).optional(), {
  valueHint: "<key>",
  description: "Compute an HMAC with this key (cryptographic algorithms only)",
});

const explicitAlgorithmFlag = flag(algorithmSchema.optional(), {
  alias: "a",
  valueHint: "<name>",
  description: "Algorithm; guessed from the hash length when omitted",
});

export const compute = defineAction({
  description: "Hash files or standard input",
  examples: [
    "btk hash package.tar.gz",
    "btk hash sha512 dist/*.js",
    "echo hello | btk hash crc32",
    "btk hash blake2b512 --hmac-key secret data.bin",
    "btk hash ./dist -r > SHA256SUMS",
  ],
  args: {
    inputs: positional(z.array(z.string()).default([]), {
      valueHint: "files",
      description:
        'Files, folders or globs; "-" or a pipe reads standard input. May start with an algorithm name',
    }),
    algorithm: flag(algorithmSchema, {
      alias: "a",
      config: "algorithm",
      valueHint: "<name>",
      description: 'Algorithm; see "btk hash algorithms"',
    }),
    encoding: flag(encodingSchema, { alias: "e", config: "encoding", description: "Digest encoding" }),
    hmacKey: hmacKeyFlag,
    recursive: flag(z.boolean(), {
      alias: "r",
      config: "recursive",
      description: "Include files in subfolders",
    }),
  },
  async run(input, ctx, meta): Promise<HashReport> {
    const { algorithm, paths } = splitAlgorithm(
      input.inputs,
      input.algorithm,
      meta.sources.algorithm === "flag",
      ctx.cwd,
    );
    const options: DigestOptions = { algorithm, encoding: input.encoding, hmacKey: input.hmacKey };
    assertHmacSupported(options);
    const source = await gatherSources(paths, ctx, input.recursive);
    return hashWithProgress(source, options, ctx);
  },
  render: renderCompute,
  exitCode: (report) =>
    report.totals.failed > 0 || report.missing.length > 0 ? ExitCode.Failure : ExitCode.Ok,
});

export const verify = defineAction({
  description: "Check a file against an expected hash (exits 1 on a mismatch)",
  examples: [
    "btk hash verify bun-darwin-aarch64.zip c669e97f6164e1c96e0701748db98dfa77492908cbd8394c7557134a735de381",
    "btk hash verify hello.txt sha384-HQ8oTv4+3qS5yjvVFPoTSxfq42HMx6Hu/v+AG5vWYE4B8h9r8knvAwWZ8MIY8rqM",
    "curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-darwin-aarch64.zip | btk hash verify - c669e97f6164e1c96e0701748db98dfa77492908cbd8394c7557134a735de381",
  ],
  args: {
    file: positional(z.string(), { description: 'File to check; "-" reads standard input' }),
    expected: positional(z.string(), { description: "Expected hash: hex, base64, or SRI (sha256-…)" }),
    algorithm: explicitAlgorithmFlag,
    hmacKey: hmacKeyFlag,
  },
  async run(input, ctx): Promise<VerifyResult> {
    const stdin = input.file === STDIN ? await readStdin(ctx.io) : undefined;
    const file = input.file === STDIN ? STDIN : resolve(ctx.cwd, input.file);
    return verifyInput(file, stdin, input.expected, {
      explicit: input.algorithm,
      preferred: hashSettings(ctx).algorithm,
      hmacKey: input.hmacKey,
    });
  },
  render: renderVerify,
  exitCode: (result) => (result.status === "match" ? ExitCode.Ok : ExitCode.Failure),
});

export type CheckReport = {
  sums: string;
  results: VerifyResult[];
  totals: { match: number; mismatch: number; failed: number };
};

export const check = defineAction({
  description: "Verify every file listed in a checksums file (sha256sum or BSD format)",
  examples: ["btk hash check SHA256SUMS", "btk hash check checksums.txt --algorithm sha512"],
  args: {
    sums: positional(z.string(), {
      valueHint: "sums-file",
      description: 'Checksums file; "-" reads standard input',
    }),
    algorithm: explicitAlgorithmFlag,
  },
  async run(input, ctx): Promise<CheckReport> {
    const sums = input.sums === STDIN ? STDIN : resolve(ctx.cwd, input.sums);
    const text = sums === STDIN ? new TextDecoder().decode(await readStdin(ctx.io)) : await readSums(sums);
    const entries = parseSums(text, sums === STDIN ? resolve(ctx.cwd, "sums") : sums);
    if (entries.length === 0) {
      throw new BtkError(`No hashes found in ${input.sums}`, {
        code: "ERR_EMPTY_SUMS",
        hint: 'Expected lines like "<hash>  <file>" or "SHA256 (file) = <hash>"',
      });
    }
    const results: VerifyResult[] = [];
    await runPool(entries, defaultConcurrency(), async (entry, index) => {
      results[index] = await verifyInput(entry.file, undefined, entry.expected, {
        explicit: input.algorithm ?? entry.algorithm,
        preferred: hashSettings(ctx).algorithm,
      });
    });
    const count = (status: VerifyResult["status"]) => results.filter((r) => r.status === status).length;
    return {
      sums,
      results,
      totals: { match: count("match"), mismatch: count("mismatch"), failed: count("failed") },
    };
  },
  render: renderCheck,
  exitCode: (report) => (report.totals.mismatch + report.totals.failed > 0 ? ExitCode.Failure : ExitCode.Ok),
});

export const algorithms = defineAction({
  description: "List the supported algorithms",
  run: (_input, ctx) =>
    ALGORITHMS.map((name) => ({ ...algorithmInfo(name), default: name === hashSettings(ctx).algorithm })),
  render: renderAlgorithms,
});

export const hash = defineTool({
  name: "hash",
  description: "Hash and verify files",
  config: hashConfig,
  defaultAction: "compute",
  actions: { compute, verify, check, algorithms },
  ui: () => import("./ui/Dashboard.tsx"),
});

export function hashSettings(ctx: BtkContext): HashConfig {
  return ctx.config.tools.hash as HashConfig;
}

/** `btk hash sha256 a.txt`: a leading algorithm name counts as the algorithm unless a file has that name. */
export function splitAlgorithm(
  inputs: string[],
  algorithm: Algorithm,
  explicit: boolean,
  cwd: string,
): { algorithm: Algorithm; paths: string[] } {
  const [first, ...rest] = inputs;
  const named = first?.toLowerCase();
  if (!first || !named || !isAlgorithm(named) || existsSync(resolve(cwd, first)))
    return { algorithm, paths: inputs };
  if (explicit && named !== algorithm) {
    throw new UsageError(`Two algorithms given: ${named} and --algorithm ${algorithm}`, {
      code: "ERR_ALGORITHM_CONFLICT",
      hint: "Keep one of them",
    });
  }
  return { algorithm: named, paths: rest };
}

async function gatherSources(paths: string[], ctx: BtkContext, recursive: boolean): Promise<HashSource> {
  const wantsStdin = paths.includes(STDIN) || (paths.length === 0 && hasPipedStdin(ctx.io));
  if (paths.length === 0 && !wantsStdin) {
    throw new UsageError("Nothing to hash", {
      code: "ERR_NO_INPUT",
      hint: "Pass files or folders, or pipe data in: echo hello | btk hash",
    });
  }
  const collected = await collectFiles(
    paths.filter((p) => p !== STDIN),
    { cwd: ctx.cwd, recursive },
  );
  collected.files = collected.files.filter((file) => !isStdoutFile(ctx.io, file.path));
  const stdin = wantsStdin ? await readStdin(ctx.io) : undefined;
  if (!stdin && collected.files.length === 0) {
    throw new BtkError("No files found", {
      code: "ERR_NO_FILES",
      details: collected.missing.map((p) => `Nothing matched ${p}`),
      hint: "Pass files or folders; add --recursive to include subfolders",
    });
  }
  return { collected, stdin };
}

async function hashWithProgress(
  source: HashSource,
  options: DigestOptions,
  ctx: BtkContext,
): Promise<HashReport> {
  const { reporter } = ctx;
  const count = source.collected.files.length + (source.stdin ? 1 : 0);
  const batch = source.collected.files.length > 1;
  reporter.log.info(`${options.algorithm}${options.hmacKey ? " HMAC" : ""} · ${pluralize(count, "input")}`);
  if (batch) reporter.progress.start(source.collected.files.length, "Hashing");
  try {
    const report = await hashAll(source, options, {
      signal: ctx.signal,
      onHashed: () => batch && reporter.progress.tick(),
    });
    if (batch) reporter.progress.done(`Hashed ${formatBytes(report.totals.bytes)}`);
    return report;
  } catch (error) {
    reporter.progress.stop();
    throw error;
  }
}

async function readSums(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new BtkError(`Checksums file not found: ${path}`, { code: "ENOENT" });
  }
  return file.text();
}
