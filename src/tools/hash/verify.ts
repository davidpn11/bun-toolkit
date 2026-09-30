import { dirname, resolve } from "node:path";
import { UsageError } from "../../errors.ts";
import { describeFileError } from "../../shared/fs.ts";
import { type Algorithm, digestLength, isAlgorithm } from "./algorithms.ts";
import { type DigestOptions, digestBytes, digestFile } from "./digest.ts";

export type Expected = {
  /** From an SRI-style value like `sha256-…`. */
  algorithm?: Algorithm;
  bytes: Buffer;
};

export type VerifyResult = {
  file: string;
  algorithm: Algorithm;
  /** True when btk picked the algorithm from the hash length. */
  inferred: boolean;
  expected: string;
  actual?: string;
  status: "match" | "mismatch" | "failed";
  reason?: string;
};

const HEX = /^[0-9a-f]+$/i;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const SRI = /^([a-z0-9-]+)-([A-Za-z0-9+/_-]+={0,2})$/;
const LIKELY = ["sha256", "sha512", "sha1", "md5", "sha384", "sha224", "crc32", "xxhash64"] as const;

export function parseExpected(value: string): Expected {
  const text = value.trim();
  const sri = SRI.exec(text);
  if (sri?.[1] && sri[2] && isAlgorithm(sri[1]))
    return { algorithm: sri[1], bytes: Buffer.from(sri[2], "base64") };
  if (HEX.test(text) && text.length % 2 === 0) return { bytes: Buffer.from(text, "hex") };
  if (BASE64.test(text)) return { bytes: Buffer.from(text, "base64") };
  throw new UsageError(`"${value}" is not a hash`, {
    code: "ERR_INVALID_HASH",
    hint: "Pass the expected hash as hex, base64, or SRI (sha256-…)",
  });
}

/** An explicit algorithm wins; otherwise the preferred one if its length fits, then the most common of that length. */
export function resolveAlgorithm(
  expected: Expected,
  explicit: Algorithm | undefined,
  preferred: Algorithm,
): { algorithm: Algorithm; inferred: boolean } {
  if (explicit) return { algorithm: explicit, inferred: false };
  if (expected.algorithm) return { algorithm: expected.algorithm, inferred: false };
  const length = expected.bytes.byteLength;
  if (digestLength(preferred) === length) return { algorithm: preferred, inferred: true };
  const match = LIKELY.find((name) => digestLength(name) === length);
  if (match) return { algorithm: match, inferred: true };
  throw new UsageError(`Can't tell the algorithm of a ${length}-byte hash`, {
    code: "ERR_UNKNOWN_ALGORITHM",
    hint: "Pass --algorithm, e.g. --algorithm sha3-256",
  });
}

export async function verifyInput(
  file: string,
  source: Uint8Array | undefined,
  expectedText: string,
  options: { explicit?: Algorithm | undefined; preferred: Algorithm; hmacKey?: string | undefined },
): Promise<VerifyResult> {
  const expected = parseExpected(expectedText);
  const { algorithm, inferred } = resolveAlgorithm(expected, options.explicit, options.preferred);
  const digestOptions: DigestOptions = { algorithm, encoding: "hex", hmacKey: options.hmacKey };
  const base = { file, algorithm, inferred, expected: expected.bytes.toString("hex") };
  try {
    const { digest } = source
      ? await digestBytes(source, digestOptions)
      : await digestFile(file, digestOptions);
    return { ...base, actual: digest, status: digest === base.expected ? "match" : "mismatch" };
  } catch (error) {
    return { ...base, status: "failed", reason: describeFileError(error).reason };
  }
}

export type SumsEntry = { expected: string; file: string; algorithm?: Algorithm };

const COREUTILS_LINE = /^\\?([0-9a-fA-F]+|[A-Za-z0-9+/_=-]+) [ *](.+)$/;
const BSD_LINE = /^([A-Za-z0-9-]+) \((.+)\) = ([0-9a-fA-F]+|[A-Za-z0-9+/_=-]+)$/;

/**
 * Reads `sha256sum`-style lines (`<hash>  <file>`) and BSD-style lines (`SHA256 (file) = <hash>`).
 * Paths are resolved against the sums file's folder, so it works from any working directory.
 */
export function parseSums(text: string, sumsPath: string): SumsEntry[] {
  const dir = dirname(sumsPath);
  const entries: SumsEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const bsd = BSD_LINE.exec(line);
    if (bsd?.[1] && bsd[2] && bsd[3]) {
      const name = bsd[1].toLowerCase();
      entries.push({
        expected: bsd[3],
        file: resolve(dir, bsd[2]),
        ...(isAlgorithm(name) && { algorithm: name }),
      });
      continue;
    }
    const plain = COREUTILS_LINE.exec(line);
    if (plain?.[1] && plain[2]) entries.push({ expected: plain[1], file: resolve(dir, plain[2]) });
  }
  return entries;
}
