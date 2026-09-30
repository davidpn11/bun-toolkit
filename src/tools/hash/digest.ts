import { UsageError } from "../../errors.ts";
import {
  type Algorithm,
  type CryptoAlgorithm,
  type FastAlgorithm,
  fastHash,
  isCrypto,
} from "./algorithms.ts";

export const ENCODINGS = ["hex", "base64", "base64url"] as const;
export type Encoding = (typeof ENCODINGS)[number];

export type DigestOptions = {
  algorithm: Algorithm;
  encoding: Encoding;
  hmacKey?: string | undefined;
};

export type Digest = { digest: string; bytes: number };

export function assertHmacSupported(options: DigestOptions): void {
  if (!options.hmacKey) return;
  if (!isCrypto(options.algorithm) || options.algorithm.startsWith("shake")) {
    throw new UsageError(`HMAC is not available for ${options.algorithm}`, {
      code: "ERR_HMAC_UNSUPPORTED",
      hint: "Use a cryptographic algorithm such as sha256 or blake2b512 with --hmac-key",
    });
  }
}

/** Streams the input through the hash, so large files never load into memory (except fast non-CRC hashes). */
export async function digestStream(
  chunks: AsyncIterable<Uint8Array>,
  options: DigestOptions,
): Promise<Digest> {
  const { algorithm } = options;
  if (isCrypto(algorithm)) return digestCrypto(chunks, algorithm, options);
  if (algorithm === "crc32") return digestCrc32(chunks, options.encoding);
  return digestFast(chunks, algorithm, options.encoding);
}

export function digestFile(path: string, options: DigestOptions): Promise<Digest> {
  return digestStream(Bun.file(path).stream(), options);
}

export function digestBytes(data: Uint8Array, options: DigestOptions): Promise<Digest> {
  return digestStream(
    (async function* () {
      yield data;
    })(),
    options,
  );
}

async function digestCrypto(
  chunks: AsyncIterable<Uint8Array>,
  algorithm: CryptoAlgorithm,
  options: DigestOptions,
): Promise<Digest> {
  const hasher = new Bun.CryptoHasher(algorithm, options.hmacKey || undefined);
  let bytes = 0;
  for await (const chunk of chunks) {
    hasher.update(chunk);
    bytes += chunk.byteLength;
  }
  return { digest: encode(hasher.digest(), options.encoding), bytes };
}

async function digestCrc32(chunks: AsyncIterable<Uint8Array>, encoding: Encoding): Promise<Digest> {
  let crc = 0;
  let bytes = 0;
  for await (const chunk of chunks) {
    crc = Bun.hash.crc32(chunk, crc);
    bytes += chunk.byteLength;
  }
  return { digest: encode(integerBytes(crc, 32), encoding), bytes };
}

async function digestFast(
  chunks: AsyncIterable<Uint8Array>,
  algorithm: FastAlgorithm,
  encoding: Encoding,
): Promise<Digest> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  const data = Buffer.concat(parts);
  const { bits, hash } = fastHash(algorithm);
  return { digest: encode(integerBytes(hash(data), bits), encoding), bytes: data.byteLength };
}

/** Big-endian bytes, so the hex form matches the usual `%08x` / `%016x` printing of these hashes. */
function integerBytes(value: number | bigint, bits: 32 | 64): Uint8Array {
  const bytes = new Uint8Array(bits / 8);
  const view = new DataView(bytes.buffer);
  if (bits === 32) view.setUint32(0, Number(value) >>> 0);
  else view.setBigUint64(0, BigInt.asUintN(64, BigInt(value)));
  return bytes;
}

function encode(bytes: Uint8Array, encoding: Encoding): string {
  return Buffer.from(bytes).toString(encoding);
}
