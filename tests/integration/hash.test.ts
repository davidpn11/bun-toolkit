import { afterEach, describe, expect, test } from "bun:test";
import { runBtk } from "../support/cli.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const HELLO_MD5 = "5d41402abc4b2a76b9719d911017c592";

describe("btk hash", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("a.txt", "hello");
    project.write("dist/b.js", "world");
    return project;
  };
  const btk = (
    args: string[],
    options: { env?: Record<string, string>; stdin?: string; tty?: boolean } = {},
  ) =>
    runBtk(args, {
      cwd: project.dir,
      env: { ...project.env, ...options.env },
      stdin: options.stdin,
      tty: options.tty,
    });

  test("prints sha256sum-compatible lines on stdout and the summary on stderr", async () => {
    setup();
    const { code, stdout, stderr } = await btk(["hash", "a.txt", "dist/b.js"]);
    expect(code).toBe(0);
    expect(stdout).toBe(
      `${HELLO_SHA256}  a.txt\n486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7  dist/b.js\n`,
    );
    expect(stderr).toContain("2 inputs");
  });

  test("the algorithm can come first, as a flag, from config or from env", async () => {
    const p = setup();
    expect((await btk(["hash", "md5", "a.txt"])).stdout).toBe(`${HELLO_MD5}  a.txt\n`);
    expect((await btk(["hash", "a.txt", "-a", "md5"])).stdout).toBe(`${HELLO_MD5}  a.txt\n`);
    expect((await btk(["hash", "a.txt"], { env: { BTK_HASH_ALGORITHM: "md5" } })).stdout).toBe(
      `${HELLO_MD5}  a.txt\n`,
    );
    p.write("btk.config.ts", `export default { tools: { hash: { algorithm: "crc32" } } };`);
    expect((await btk(["hash", "a.txt"])).stdout).toBe("3610a686  a.txt\n");
  });

  test("reads standard input from a pipe or -", async () => {
    setup();
    expect((await btk(["hash"], { stdin: "hello" })).stdout).toBe(`${HELLO_SHA256}  -\n`);
    expect((await btk(["hash", "md5", "-", "a.txt"], { stdin: "hello" })).stdout).toBe(
      `${HELLO_MD5}  -\n${HELLO_MD5}  a.txt\n`,
    );
  });

  test("nothing to hash in an interactive terminal is a usage error", async () => {
    setup();
    const { code, stderr } = await btk(["hash"], { tty: true });
    expect(code).toBe(2);
    expect(stderr).toContain("Nothing to hash");
  });

  test("folders need --recursive for subfolders; missing paths exit 1", async () => {
    setup();
    expect((await btk(["hash", "."])).stdout.trim().split("\n")).toHaveLength(1);
    expect((await btk(["hash", ".", "-r"])).stdout.trim().split("\n")).toHaveLength(2);
    const missing = await btk(["hash", "a.txt", "nope.txt"]);
    expect(missing.code).toBe(1);
    expect(missing.stdout).toBe(`${HELLO_SHA256}  a.txt\n`);
    expect(missing.stderr).toContain("Nothing matched nope.txt");
  });

  test("json output carries every result", async () => {
    setup();
    const { stdout } = await btk(["hash", "a.txt", "--json", "-e", "base64"]);
    const body = JSON.parse(stdout);
    expect(body).toMatchObject({
      ok: true,
      command: "hash compute",
      data: { algorithm: "sha256", encoding: "base64" },
    });
    expect(body.data.results[0]).toMatchObject({
      status: "ok",
      digest: "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=",
      bytes: 5,
    });
  });

  test("ci mode has no ANSI; human mode colors the digest", async () => {
    setup();
    const ci = await btk(["hash", "a.txt"], { env: { CI: "true" } });
    expect(ci.stdout + ci.stderr).not.toMatch(ANSI);
    const human = await btk(["hash", "a.txt"], { tty: true });
    expect(human.stdout).toMatch(ANSI);
  });

  test("HMAC with a fast hash is a usage error", async () => {
    setup();
    const { code, stderr } = await btk(["hash", "crc32", "a.txt", "--hmac-key", "k"]);
    expect(code).toBe(2);
    expect(stderr).toContain("HMAC is not available for crc32");
  });

  test("verify matches, guesses the algorithm, and exits 1 on a mismatch", async () => {
    setup();
    const ok = await btk(["hash", "verify", "a.txt", HELLO_MD5], { env: { CI: "true" } });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("a.txt matches (md5, guessed from the hash length)");
    const bad = await btk(["hash", "verify", "a.txt", "0".repeat(64)], { env: { CI: "true" } });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("does not match");
    expect(bad.stdout).toContain(`actual: ${HELLO_SHA256}`);
    const piped = await btk(["hash", "verify", "-", HELLO_SHA256, "--json"], { stdin: "hello" });
    expect(JSON.parse(piped.stdout).data).toMatchObject({ file: "-", status: "match", algorithm: "sha256" });
  });

  test("check verifies a sums file written by btk hash", async () => {
    const p = setup();
    const sums = await btk(["hash", ".", "-r"]);
    p.write("SHA256SUMS", sums.stdout);
    const ok = await btk(["hash", "check", "SHA256SUMS"], { env: { CI: "true" } });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("Checked matched=2");
    p.write("dist/b.js", "changed");
    const bad = await btk(["hash", "check", "SHA256SUMS"], { env: { CI: "true" } });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("dist/b.js does not match");
  });

  test("algorithms lists every algorithm and marks the default", async () => {
    setup();
    const { stdout } = await btk(["hash", "algorithms"], { env: { CI: "true" } });
    expect(stdout).toContain("sha256\tcryptographic\t256\tdefault");
    expect(stdout).toContain("xxhash3\tfast\t64");
  });
});
