import { describe, expect, test } from "bun:test";
import { UsageError } from "../../errors.ts";
import type { HashSettings } from "./config.ts";
import { bunOptions, describeSettings, hashPassword, verifyPassword } from "./hashing.ts";
import { inspectHash, parseHash } from "./inspect.ts";

const fast: HashSettings = { algorithm: "argon2id", memoryCost: 1024, timeCost: 1, cost: 4 };
const strong: HashSettings = { algorithm: "argon2id", memoryCost: 65_536, timeCost: 2, cost: 10 };

describe("hashing", () => {
  test("argon2 hashes verify, and each hash is salted", async () => {
    const a = await hashPassword("s3cret", fast);
    const b = await hashPassword("s3cret", fast);
    expect(a.hash).toStartWith("$argon2id$v=19$m=1024,t=1,p=1$");
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword("s3cret", a.hash)).toBe(true);
    expect(await verifyPassword("S3cret", a.hash)).toBe(false);
  });

  test("bcrypt uses the configured cost", async () => {
    const { hash } = await hashPassword("s3cret", { ...fast, algorithm: "bcrypt" });
    expect(hash).toStartWith("$2b$04$");
    expect(await verifyPassword("s3cret", hash)).toBe(true);
  });

  test("empty passwords and unknown hashes are usage errors", async () => {
    await expect(hashPassword("", fast)).rejects.toBeInstanceOf(UsageError);
    await expect(verifyPassword("x", "not-a-hash")).rejects.toBeInstanceOf(UsageError);
  });

  test("settings map to Bun's options and read well", () => {
    expect(bunOptions(fast)).toEqual({ algorithm: "argon2id", memoryCost: 1024, timeCost: 1 });
    expect(bunOptions({ ...fast, algorithm: "bcrypt" })).toEqual({ algorithm: "bcrypt", cost: 4 });
    expect(describeSettings(strong)).toBe("argon2id · 64 MiB · 2 passes");
    expect(describeSettings({ ...strong, memoryCost: 100 })).toBe("argon2id · 100 KiB · 2 passes");
    expect(describeSettings({ ...strong, algorithm: "bcrypt" })).toBe("bcrypt · cost 10");
  });
});

describe("inspecting hashes", () => {
  const argon =
    "$argon2id$v=19$m=19456,t=2,p=1$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
  const bcrypt = `$2b$08$${"a".repeat(53)}`;

  test("reads argon2 and bcrypt parameters", () => {
    expect(parseHash(argon)).toEqual({
      algorithm: "argon2id",
      version: 19,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(parseHash(bcrypt)).toEqual({ algorithm: "bcrypt", cost: 8 });
    expect(() => parseHash("$1$md5crypt$abc")).toThrow("not an argon2 or bcrypt hash");
  });

  test("lists what is weaker than the current settings", () => {
    expect(inspectHash(argon, strong).weaker).toEqual(["memory 19456 KiB is below 65536 KiB"]);
    expect(inspectHash(argon, { ...strong, memoryCost: 19_456 }).weaker).toEqual([]);
    expect(inspectHash(bcrypt, strong).weaker).toEqual(["uses bcrypt, your settings use argon2id"]);
    expect(inspectHash(bcrypt, { ...strong, algorithm: "bcrypt" }).weaker).toEqual(["cost 8 is below 10"]);
  });
});
