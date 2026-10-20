import { afterEach, describe, expect, test } from "bun:test";
import { basename, join, resolve } from "node:path";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { UsageError } from "../../errors.ts";
import { collectFiles } from "../../shared/collect.ts";
import { ALGORITHMS, algorithmInfo } from "./algorithms.ts";
import { hashAll } from "./compute.ts";
import { assertHmacSupported, digestBytes, digestStream } from "./digest.ts";
import { splitAlgorithm } from "./tool.ts";
import { parseExpected, parseSums, resolveAlgorithm, verifyInput } from "./verify.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const hello = new TextEncoder().encode("hello");
const hex = (algorithm: (typeof ALGORITHMS)[number]) =>
  digestBytes(hello, { algorithm, encoding: "hex" }).then((d) => d.digest);

describe("digests", () => {
  test("match well-known values", async () => {
    expect(await hex("sha256")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(await hex("md5")).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(await hex("sha1")).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    expect(await hex("crc32")).toBe("3610a686");
  });

  test("every algorithm produces a digest of its declared size", async () => {
    for (const name of ALGORITHMS) {
      expect((await hex(name)).length).toBe(algorithmInfo(name).bits / 4);
    }
  });

  test("streaming in chunks gives the same digest as one buffer", async () => {
    const data = new Uint8Array(300_000).map((_, i) => i % 251);
    async function* chunks() {
      for (let i = 0; i < data.length; i += 65_536) yield data.subarray(i, i + 65_536);
    }
    for (const algorithm of ["sha256", "crc32", "xxhash3"] as const) {
      const whole = await digestBytes(data, { algorithm, encoding: "hex" });
      const streamed = await digestStream(chunks(), { algorithm, encoding: "hex" });
      expect(streamed).toEqual(whole);
    }
  });

  test("encodings and HMAC", async () => {
    const b64 = await digestBytes(hello, { algorithm: "sha256", encoding: "base64" });
    expect(b64.digest).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
    const url = await digestBytes(hello, { algorithm: "sha256", encoding: "base64url" });
    expect(url.digest).toBe("LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ");
    const hmac = await digestBytes(hello, { algorithm: "sha256", encoding: "hex", hmacKey: "secret" });
    expect(hmac.digest).toBe("88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b");
  });

  test("HMAC needs a cryptographic algorithm", () => {
    expect(() => assertHmacSupported({ algorithm: "crc32", encoding: "hex", hmacKey: "k" })).toThrow(
      UsageError,
    );
    expect(() => assertHmacSupported({ algorithm: "shake128", encoding: "hex", hmacKey: "k" })).toThrow(
      UsageError,
    );
    expect(() => assertHmacSupported({ algorithm: "sha512", encoding: "hex", hmacKey: "k" })).not.toThrow();
  });

  test("verifying with a key refuses an expected hash that picks a keyless algorithm", async () => {
    const source = new TextEncoder().encode("hello");
    const options = { preferred: "sha256" as const, hmacKey: "k" };
    await expect(verifyInput("-", source, "3610a686", options)).rejects.toThrow(UsageError);
    await expect(digestBytes(source, { algorithm: "crc32", encoding: "hex", hmacKey: "k" })).rejects.toThrow(
      UsageError,
    );
  });
});

describe("splitAlgorithm()", () => {
  test("a leading algorithm name is the algorithm, unless a file has that name", () => {
    project = createTempProject();
    expect(splitAlgorithm(["md5", "a.txt"], "sha256", false, project.dir)).toEqual({
      algorithm: "md5",
      paths: ["a.txt"],
    });
    expect(splitAlgorithm(["SHA512"], "sha256", false, project.dir)).toEqual({
      algorithm: "sha512",
      paths: [],
    });
    project.write("md5", "a file called md5");
    expect(splitAlgorithm(["md5"], "sha256", false, project.dir)).toEqual({
      algorithm: "sha256",
      paths: ["md5"],
    });
  });

  test("conflicts with an explicit --algorithm", () => {
    project = createTempProject();
    expect(() => splitAlgorithm(["md5", "a"], "sha1", true, project.dir)).toThrow("Two algorithms given");
    expect(splitAlgorithm(["md5", "a"], "md5", true, project.dir).algorithm).toBe("md5");
  });
});

describe("expected hashes", () => {
  test("hex, base64 and SRI", () => {
    expect(parseExpected("2CF24DBA").bytes.toString("hex")).toBe("2cf24dba");
    const sri = parseExpected("sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
    expect(sri.algorithm).toBe("sha256");
    expect(sri.bytes.toString("hex")).toStartWith("2cf24dba");
    expect(() => parseExpected("not a hash!")).toThrow(UsageError);
  });

  test("the algorithm comes from the flag, the SRI prefix, the preferred one, then the length", () => {
    const sha256 = parseExpected("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(resolveAlgorithm(sha256, "sha3-256", "sha256")).toEqual({
      algorithm: "sha3-256",
      inferred: false,
    });
    expect(resolveAlgorithm(sha256, undefined, "blake2s256")).toEqual({
      algorithm: "blake2s256",
      inferred: true,
    });
    expect(resolveAlgorithm(sha256, undefined, "md5")).toEqual({ algorithm: "sha256", inferred: true });
    expect(
      resolveAlgorithm(parseExpected("5d41402abc4b2a76b9719d911017c592"), undefined, "sha256").algorithm,
    ).toBe("md5");
    expect(() => resolveAlgorithm(parseExpected("abcdef"), undefined, "sha256")).toThrow("3-byte hash");
  });

  test("verifyInput reports match, mismatch and unreadable files", async () => {
    project = createTempProject();
    const file = project.write("a.txt", "hello");
    const options = { preferred: "sha256" as const };
    expect((await verifyInput(file, undefined, "5d41402abc4b2a76b9719d911017c592", options)).status).toBe(
      "match",
    );
    expect((await verifyInput(file, undefined, "00000000000000000000000000000000", options)).status).toBe(
      "mismatch",
    );
    const missing = await verifyInput(
      join(project.dir, "nope"),
      undefined,
      "5d41402abc4b2a76b9719d911017c592",
      options,
    );
    expect(missing).toMatchObject({ status: "failed", reason: "File not found" });
  });

  test("parseSums reads coreutils and BSD lines relative to the sums file", () => {
    const text = [
      "# comment",
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  a.txt",
      "5d41402abc4b2a76b9719d911017c592 *bin/b.dat",
      "SHA512 (c.txt) = abcd",
      "",
    ].join("\n");
    expect(parseSums(text, "/p/SUMS")).toEqual([
      {
        expected: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        file: resolve("/p/a.txt"),
      },
      { expected: "5d41402abc4b2a76b9719d911017c592", file: resolve("/p/bin/b.dat") },
      { expected: "abcd", file: resolve("/p/c.txt"), algorithm: "sha512" },
    ]);
  });
});

describe("hashAll()", () => {
  test("hashes files and stdin, and counts failures", async () => {
    project = createTempProject();
    project.write("a.txt", "hello");
    project.write("b.txt", "world");
    const collected = await collectFiles(["a.txt", "b.txt", "nope.txt"], {
      cwd: project.dir,
      recursive: false,
    });
    const report = await hashAll({ collected, stdin: hello }, { algorithm: "md5", encoding: "hex" });
    expect(report.results.map((r) => basename(r.file))).toEqual(["-", "a.txt", "b.txt"]);
    expect(report.results[0]?.digest).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(report.totals).toEqual({ hashed: 3, failed: 0, bytes: 15 });
    expect(report.missing).toEqual(["nope.txt"]);
  });
});
