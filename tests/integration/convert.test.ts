import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runBtk } from "../support/cli.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

describe("btk convert", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("app.yaml", "name: app\nport: 8080\n");
    project.write("cfg/server.toml", "[server]\nport = 80\n");
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

  test("one file prints JSON to stdout by default", async () => {
    setup();
    const { code, stdout, stderr } = await btk(["convert", "app.yaml"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ name: "app", port: 8080 });
    expect(stderr).toContain("yaml → json");
  });

  test("--to, --no-pretty and --indent", async () => {
    setup();
    expect((await btk(["convert", "app.yaml", "-t", "toml"])).stdout).toBe('name = "app"\nport = 8080\n');
    expect((await btk(["convert", "app.yaml", "--no-pretty"])).stdout).toBe('{"name":"app","port":8080}\n');
    expect((await btk(["convert", "app.yaml", "--indent", "4"])).stdout).toContain('    "name"');
  });

  test("config and env set the default target", async () => {
    const p = setup();
    p.write("btk.config.ts", `export default { tools: { convert: { to: "yaml" } } };`);
    expect((await btk(["convert", "cfg/server.toml"])).stdout).toBe("server:\n  port: 80\n");
    expect(
      (await btk(["convert", "cfg/server.toml"], { env: { BTK_CONVERT_TO: "json5" } })).stdout,
    ).toContain("port: 80");
  });

  test("stdin: detected for JSON, otherwise --from is required", async () => {
    setup();
    expect((await btk(["convert", "-t", "yaml"], { stdin: '{"a":[1]}' })).stdout).toBe("a:\n  - 1\n");
    const unknown = await btk(["convert"], { stdin: "a: 1" });
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("Pass --from");
    expect((await btk(["convert", "--from", "yaml"], { stdin: "a: 1" })).stdout).toBe('{\n  "a": 1\n}\n');
  });

  test("-o writes one file and refuses to replace it", async () => {
    const p = setup();
    const first = await btk(["convert", "app.yaml", "-t", "json5", "-o", "out/app.json5"]);
    expect(first.code).toBe(0);
    expect(readFileSync(join(p.dir, "out/app.json5"), "utf8")).toContain("name: 'app'");
    const again = await btk(["convert", "app.yaml", "-t", "json5", "-o", "out/app.json5"]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("--overwrite");
  });

  test("several files are written next to the originals, and a rerun skips them", async () => {
    const p = setup();
    const { code, body } = await btk(["convert", ".", "-r", "-t", "json", "--json"]).then((r) => ({
      ...r,
      body: JSON.parse(r.stdout),
    }));
    expect(code).toBe(0);
    expect(body.data).toMatchObject({ mode: "batch", totals: { converted: 2 } });
    expect(existsSync(join(p.dir, "cfg/server.json"))).toBe(true);
    const rerun = JSON.parse((await btk(["convert", ".", "-r", "--json"])).stdout);
    expect(rerun.data.totals).toEqual({ converted: 0, skipped: 4, failed: 0 });
  });

  test("a bad file fails with the format and exit 1, and the rest still convert", async () => {
    const p = setup();
    p.write("bad.json", "{nope");
    const { code, stdout } = await btk(["convert", ".", "-t", "json5"], { env: { CI: "true" } });
    expect(code).toBe(1);
    expect(stdout).toContain("Invalid JSON");
    expect(stdout).toContain("Done converted=1 failed=1");
    expect(stdout).not.toMatch(ANSI);
  });

  test("TOML output of a list explains the problem", async () => {
    const p = setup();
    p.write("list.json", "[1,2]");
    const { code, stderr } = await btk(["convert", "list.json", "-t", "toml"]);
    expect(code).toBe(1);
    expect(stderr).toContain("TOML needs a table");
  });

  test("--from reads files with other extensions when named explicitly", async () => {
    const p = setup();
    p.write("notes.txt", "a: 1\n");
    expect((await btk(["convert", "notes.txt", "--from", "yaml"])).stdout).toBe('{\n  "a": 1\n}\n');
    const without = await btk(["convert", "notes.txt"]);
    expect(without.code).toBe(1);
    expect(without.stderr).toContain("no known data extension");
  });

  test("json mode returns the converted text", async () => {
    setup();
    const body = JSON.parse((await btk(["convert", "app.yaml", "--json"])).stdout);
    expect(body.data).toMatchObject({ mode: "stdout", from: "yaml", to: "json" });
    expect(JSON.parse(body.data.output)).toEqual({ name: "app", port: 8080 });
  });

  test("formats lists what can be read and written", async () => {
    setup();
    const { stdout } = await btk(["convert", "formats"], { env: { CI: "true" } });
    expect(stdout).toContain("jsonc\t✔\t\t.jsonc");
    expect(stdout).toContain("yaml\t✔\t✔\t.yaml .yml");
  });
});
