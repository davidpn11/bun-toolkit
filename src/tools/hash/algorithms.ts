type Input = Uint8Array;
type FastHash = { bits: 32 | 64; hash: (data: Input) => number | bigint };

export const CRYPTO_ALGORITHMS = [
  "sha256",
  "sha512",
  "sha384",
  "sha224",
  "sha1",
  "md5",
  "sha512-256",
  "sha512-224",
  "sha3-256",
  "sha3-512",
  "sha3-384",
  "sha3-224",
  "blake2b256",
  "blake2b512",
  "blake2s256",
  "shake128",
  "shake256",
  "ripemd160",
  "md4",
] as const satisfies readonly Bun.SupportedCryptoAlgorithms[];

export const FAST_ALGORITHMS = [
  "crc32",
  "adler32",
  "xxhash3",
  "xxhash64",
  "xxhash32",
  "wyhash",
  "rapidhash",
  "cityhash64",
  "cityhash32",
  "murmur64v2",
  "murmur32v3",
  "murmur32v2",
] as const;

export const ALGORITHMS = [...CRYPTO_ALGORITHMS, ...FAST_ALGORITHMS] as const;

export type CryptoAlgorithm = (typeof CRYPTO_ALGORITHMS)[number];
export type FastAlgorithm = (typeof FAST_ALGORITHMS)[number];
export type Algorithm = (typeof ALGORITHMS)[number];

const FAST: Record<FastAlgorithm, FastHash> = {
  crc32: { bits: 32, hash: (d) => Bun.hash.crc32(d) },
  adler32: { bits: 32, hash: (d) => Bun.hash.adler32(d) },
  xxhash3: { bits: 64, hash: (d) => Bun.hash.xxHash3(d) },
  xxhash64: { bits: 64, hash: (d) => Bun.hash.xxHash64(d) },
  xxhash32: { bits: 32, hash: (d) => Bun.hash.xxHash32(d) },
  wyhash: { bits: 64, hash: (d) => Bun.hash.wyhash(d) },
  rapidhash: { bits: 64, hash: (d) => Bun.hash.rapidhash(d) },
  cityhash64: { bits: 64, hash: (d) => Bun.hash.cityHash64(d) },
  cityhash32: { bits: 32, hash: (d) => Bun.hash.cityHash32(d) },
  murmur64v2: { bits: 64, hash: (d) => Bun.hash.murmur64v2(d) },
  murmur32v3: { bits: 32, hash: (d) => Bun.hash.murmur32v3(d) },
  murmur32v2: { bits: 32, hash: (d) => Bun.hash.murmur32v2(d) },
};

export function isAlgorithm(name: string): name is Algorithm {
  return (ALGORITHMS as readonly string[]).includes(name);
}

export function isCrypto(algorithm: Algorithm): algorithm is CryptoAlgorithm {
  return (CRYPTO_ALGORITHMS as readonly string[]).includes(algorithm);
}

export function fastHash(algorithm: FastAlgorithm): FastHash {
  return FAST[algorithm];
}

export function digestLength(algorithm: Algorithm): number {
  return isCrypto(algorithm) ? new Bun.CryptoHasher(algorithm).byteLength : FAST[algorithm].bits / 8;
}

export type AlgorithmInfo = { name: Algorithm; kind: "cryptographic" | "fast"; bits: number };

export function algorithmInfo(name: Algorithm): AlgorithmInfo {
  return { name, kind: isCrypto(name) ? "cryptographic" : "fast", bits: digestLength(name) * 8 };
}
