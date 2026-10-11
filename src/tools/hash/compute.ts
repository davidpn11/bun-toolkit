import type { Collected } from "../../shared/collect.ts";
import { describeFileError } from "../../shared/fs.ts";
import { defaultConcurrency, runPool } from "../../shared/pool.ts";
import { STDIN } from "../../shared/stdio.ts";
import { type DigestOptions, digestBytes, digestFile } from "./digest.ts";

export type HashResult = {
  file: string;
  status: "ok" | "failed";
  digest?: string;
  bytes?: number;
  code?: string;
  reason?: string;
};

export type HashReport = {
  algorithm: DigestOptions["algorithm"];
  encoding: DigestOptions["encoding"];
  hmac: boolean;
  results: HashResult[];
  missing: string[];
  ignored: string[];
  totals: { hashed: number; failed: number; bytes: number };
  durationMs: number;
};

export type HashSource = { collected: Collected; stdin?: Uint8Array | undefined };

export type HashHooks = {
  signal?: AbortSignal;
  onHashed?: (result: HashResult) => void;
};

export async function hashAll(
  source: HashSource,
  options: DigestOptions,
  hooks: HashHooks = {},
): Promise<HashReport> {
  const started = performance.now();
  const results: HashResult[] = [];
  if (source.stdin)
    results.push(await hashInput(STDIN, () => digestBytes(source.stdin as Uint8Array, options)));

  const offset = results.length;
  await runPool(source.collected.files, defaultConcurrency(), async ({ path }, index) => {
    if (hooks.signal?.aborted) return;
    const result = await hashInput(path, () => digestFile(path, options));
    results[offset + index] = result;
    hooks.onHashed?.(result);
  });

  const done = results.filter((r): r is HashResult => r !== undefined);
  return {
    algorithm: options.algorithm,
    encoding: options.encoding,
    hmac: Boolean(options.hmacKey),
    results: done,
    missing: source.collected.missing,
    ignored: source.collected.ignored,
    totals: {
      hashed: done.filter((r) => r.status === "ok").length,
      failed: done.filter((r) => r.status === "failed").length,
      bytes: done.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    },
    durationMs: Math.round(performance.now() - started),
  };
}

async function hashInput(
  file: string,
  run: () => Promise<{ digest: string; bytes: number }>,
): Promise<HashResult> {
  try {
    return { file, status: "ok", ...(await run()) };
  } catch (error) {
    return { file, status: "failed", ...describeFileError(error) };
  }
}
