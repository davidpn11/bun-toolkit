import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runBtk } from "../support/cli.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

const BODY = "console.log('hello from the bundle');\n".repeat(300);

describe("btk compress and decompress", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("bundle.js", BODY);
    project.write("site/index.html", "<p>hi</p>".repeat(100));
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

  test("compress writes gzip next to the file by default and keeps the original", async () => {
    const p = setup();
    const { code, stdout, stderr } = await btk(["compress", "bundle.js"], { tty: true });
    expect(code).toBe(0);
    expect(stderr).toContain("gzip 9");
    expect(stdout).toContain("bundle.js.gz");
    expect(stdout).toMatch(ANSI);
    expect(Bun.gunzipSync(readFileSync(join(p.dir, "bundle.js.gz"))).byteLength).toBe(BODY.length);
    expect(existsSync(join(p.dir, "bundle.js"))).toBe(true);
  });

  test("shortcut flags pick formats; config sets the default", async () => {
    const p = setup();
    const both = JSON.parse((await btk(["compress", "bundle.js", "--zstd", "--brotli", "--json"])).stdout);
    expect(both.data.results.map((r: { format: string }) => r.format)).toEqual(["zstd", "brotli"]);
    p.write("btk.config.ts", `export default { tools: { compress: { format: "deflate", level: 6 } } };`);
    const configured = JSON.parse((await btk(["compress", "bundle.js", "--json"])).stdout);
    expect(configured.data.results[0]).toMatchObject({ format: "deflate", level: 6 });
  });

  test("an out-of-range level for the format is a usage error", async () => {
    setup();
    const { code, stderr } = await btk(["compress", "bundle.js", "--brotli", "--level", "15"]);
    expect(code).toBe(2);
    expect(stderr).toContain("brotli levels go from 0 to 11");
  });

  test("folders become archives, and decompress extracts them back", async () => {
    const p = setup();
    expect((await btk(["compress", "site", "--zstd"])).code).toBe(0);
    expect(existsSync(join(p.dir, "site.tar.zst"))).toBe(true);
    const target = join(p.dir, "restored");
    const { code } = await btk(["decompress", "site.tar.zst", "-o", target]);
    expect(code).toBe(0);
    expect(readFileSync(join(target, "site/index.html"), "utf8")).toBe("<p>hi</p>".repeat(100));
  });

  test("stdin to -o, and --stdout for reading a compressed file", async () => {
    const p = setup();
    expect((await btk(["compress", "--zstd", "-o", "piped.zst"], { stdin: BODY })).code).toBe(0);
    expect(new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(join(p.dir, "piped.zst"))))).toBe(
      BODY,
    );
    const { stdout } = await btk(["decompress", "piped.zst", "--stdout"]);
    expect(stdout).toBe(BODY);
  });

  test("compressed data is never printed to a terminal or put in JSON", async () => {
    setup();
    const terminal = await btk(["compress"], { stdin: BODY, tty: true });
    expect(terminal.code).toBe(2);
    expect(terminal.stderr).toContain("Refusing to print compressed data");
    const json = await btk(["compress", "--json"], { stdin: BODY });
    expect(json.code).toBe(2);
    expect(JSON.parse(json.stdout).error.code).toBe("ERR_JSON_BINARY");
  });

  test("a rerun skips existing outputs; ci output has no ANSI", async () => {
    setup();
    await btk(["compress", "bundle.js"]);
    const { code, stdout } = await btk(["compress", "bundle.js"], { env: { CI: "true" } });
    expect(code).toBe(0);
    expect(stdout).toContain("bundle.js.gz already exists");
    expect(stdout).toContain("Done compressed=0 skipped=1");
    expect(stdout).not.toMatch(ANSI);
  });

  test("decompress fails clearly on files it can't identify", async () => {
    const p = setup();
    p.write("mystery.bin", "not compressed");
    const { code, stdout } = await btk(["decompress", "mystery.bin"], { env: { CI: "true" } });
    expect(code).toBe(1);
    expect(stdout).toContain("Can't tell how it is compressed");
  });

  test("json output carries the batch report", async () => {
    setup();
    const { code, stdout } = await btk(["compress", "bundle.js", "--zstd", "--json"]);
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout);
    expect(envelope).toMatchObject({ ok: true, command: "compress run" });
    expect(envelope.data).toMatchObject({ mode: "batch", cancelled: false, totals: { done: 1, failed: 0 } });
    expect(envelope.data.results[0]).toMatchObject({ format: "zstd", level: 19, status: "done" });
  });

  test("help shows each tool's options and examples", async () => {
    setup();
    const tool = await btk(["compress", "--help"]);
    expect(tool.code).toBe(0);
    expect(tool.stdout).toContain("formats");
    const run = await btk(["compress", "run", "--help"]);
    expect(run.stdout).toContain("--brotli");
    expect(run.stdout).toContain("btk compress ./site --zstd");
    const decompress = await btk(["decompress", "run", "--help"]);
    expect(decompress.stdout).toContain("--stdout");
  });

  test("formats lists levels per format", async () => {
    setup();
    const { stdout } = await btk(["compress", "formats"], { env: { CI: "true" } });
    expect(stdout).toContain("zstd\t.zst\t1 to 22\t19");
  });
});
