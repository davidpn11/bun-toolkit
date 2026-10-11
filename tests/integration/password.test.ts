import { afterEach, describe, expect, test } from "bun:test";
import { runBtk } from "../support/cli.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

const FAST = `export default { tools: { password: { memoryCost: 1024, timeCost: 1, cost: 4 } } };`;

describe("btk password", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("btk.config.ts", FAST);
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

  test("hash reads standard input and prints only the hash", async () => {
    setup();
    const { code, stdout, stderr } = await btk(["password", "hash"], { stdin: "s3cret\n" });
    expect(code).toBe(0);
    const [hash, ...rest] = stdout.trim().split("\n");
    expect(rest).toEqual([]);
    expect(hash).toStartWith("$argon2id$v=19$m=1024,t=1,p=1$");
    expect(await Bun.password.verify("s3cret", hash ?? "")).toBe(true);
    expect(stderr).toContain("argon2id");
  });

  test("one hash per input line, in order", async () => {
    setup();
    const { stdout } = await btk(["password", "hash"], { stdin: "one\ntwo\n\nthree\n" });
    const hashes = stdout.trim().split("\n");
    expect(hashes).toHaveLength(3);
    expect(await Bun.password.verify("two", hashes[1] ?? "")).toBe(true);
  });

  test("passwords given as arguments work but warn about shell history", async () => {
    setup();
    const { code, stdout, stderr } = await btk(["password", "hash", "hunter2"], { tty: true });
    expect(code).toBe(0);
    expect(stdout).toMatch(ANSI);
    expect(stderr).toContain("shell history");
  });

  test("algorithm and cost come from flags, env or config", async () => {
    setup();
    expect((await btk(["pw", "hash", "-a", "bcrypt"], { stdin: "x" })).stdout).toStartWith("$2b$04$");
    expect((await btk(["pw", "hash", "-a", "bcrypt", "--cost", "5"], { stdin: "x" })).stdout).toStartWith(
      "$2b$05$",
    );
    const env = await btk(["pw", "hash"], { stdin: "x", env: { BTK_PASSWORD_ALGORITHM: "argon2i" } });
    expect(env.stdout).toStartWith("$argon2i$");
  });

  test("json output has the hashes and settings but never the password", async () => {
    setup();
    const { stdout } = await btk(["password", "hash", "--json"], { stdin: "topsecret" });
    const body = JSON.parse(stdout);
    expect(body.data).toMatchObject({
      algorithm: "argon2id",
      source: "stdin",
      settings: { memoryCost: 1024 },
    });
    expect(body.data.hashes).toHaveLength(1);
    expect(stdout).not.toContain("topsecret");
  });

  test("no password at all is a usage error", async () => {
    setup();
    const { code, stderr } = await btk(["password", "hash"]);
    expect(code).toBe(2);
    expect(stderr).toContain("No password on standard input");
  });

  test("verify exits 0 on a match and 1 otherwise", async () => {
    setup();
    const hash = (await btk(["password", "hash"], { stdin: "s3cret" })).stdout.trim();
    const ok = await btk(["password", "verify", hash], { stdin: "s3cret", env: { CI: "true" } });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("The password matches (argon2id)");
    const bad = await btk(["password", "verify", hash], { stdin: "wrong", env: { CI: "true" } });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("does not match");
    const invalid = await btk(["password", "verify", "nope"], { stdin: "x" });
    expect(invalid.code).toBe(2);
  });

  test("verify points out hashes weaker than the current settings", async () => {
    setup();
    const weak = (await btk(["password", "hash", "--memory-cost", "512"], { stdin: "s3cret" })).stdout.trim();
    const { stdout } = await btk(["password", "verify", weak], { stdin: "s3cret", env: { CI: "true" } });
    expect(stdout).toContain("memory 512 KiB is below 1024 KiB");
  });

  test("ci output has no ANSI codes", async () => {
    setup();
    const hashed = await btk(["password", "hash"], { stdin: "s3cret", env: { CI: "true" } });
    const checked = await btk(["password", "verify", hashed.stdout.trim()], {
      stdin: "s3cret",
      env: { CI: "true" },
    });
    expect(checked.code).toBe(0);
    expect(hashed.stdout + hashed.stderr + checked.stdout + checked.stderr).not.toMatch(ANSI);
  });

  test("help shows the actions and their options", async () => {
    setup();
    const tool = await btk(["password", "--help"]);
    expect(tool.code).toBe(0);
    expect(tool.stdout).toContain("verify");
    expect(tool.stdout).toContain("inspect");
    const action = await btk(["password", "hash", "--help"]);
    expect(action.stdout).toContain("--memory-cost");
  });

  test("inspect shows the parameters", async () => {
    setup();
    const hash = (await btk(["password", "hash", "-a", "bcrypt"], { stdin: "x" })).stdout.trim();
    const { stdout } = await btk(["password", "inspect", hash, "--json"]);
    expect(JSON.parse(stdout).data).toMatchObject({
      algorithm: "bcrypt",
      cost: 4,
      weaker: ["uses bcrypt, your settings use argon2id"],
    });
  });
});
