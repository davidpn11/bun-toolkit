import { afterEach, describe, expect, test } from "bun:test";
import { runBtk } from "../support/cli.ts";
import { testRegistry } from "../support/fake-tool.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

/**
 * What a new tool gets for free from `defineTool()`: routing, help, validated flags, config
 * defaults, env vars, JSON output and `--ui`. Uses the test-only `demo` tool, run in-process.
 */
describe("a registered tool", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const btk = (args: string[], env: Record<string, string> = {}, tty = false) => {
    project ??= createTempProject();
    return runBtk(args, { registry: testRegistry(), cwd: project.dir, env: { ...project.env, ...env }, tty });
  };
  const fresh = () => {
    project = createTempProject();
    return project;
  };

  test("appears in root help under Tools", async () => {
    fresh();
    const { stdout } = await btk(["--help"]);
    expect(stdout).toContain("Tools");
    expect(stdout).toMatch(/demo \(dm\)\s+A fake tool for tests/);
  });

  test("tool help lists actions, the default action and --ui", async () => {
    fresh();
    const { code, stdout } = await btk(["demo", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("process (default)");
    expect(stdout).toContain("btk demo --ui");
    expect(stdout).not.toContain("fail");
  });

  test("action help shows flags, choices, defaults and examples", async () => {
    fresh();
    const { stdout } = await btk(["demo", "process", "--help"]);
    expect(stdout).toContain("btk demo process <files...> [options]");
    expect(stdout).toContain("-l, --level <1-9>");
    expect(stdout).toContain("--mode <fast|slow>");
    expect(stdout).toContain("(default: 5)");
    expect(stdout).toContain("btk demo a.txt b.txt --level 7");
  });

  test("help shows where a config-backed default comes from", async () => {
    const p = fresh();
    p.write("btk.config.ts", `export default { tools: { demo: { level: 8 } } };`);
    const { stdout } = await btk(["demo", "process", "--help"]);
    expect(stdout).toContain("(default: 8 from project config)");
  });

  test("the default action runs when the first argument is not an action", async () => {
    fresh();
    const { code, stdout } = await btk(["demo", "a.txt", "b.txt", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      command: "demo process",
      data: { files: ["a.txt", "b.txt"], level: 5, mode: "fast", shout: false },
    });
  });

  test("aliases route to the tool", async () => {
    fresh();
    expect((await btk(["dm", "x", "--json"])).code).toBe(0);
  });

  test("flag > env > project > global > default", async () => {
    const p = fresh();
    p.writeGlobal(`export default { tools: { demo: { level: 2, mode: "slow" } } };`);
    const data = async (args: string[], env: Record<string, string> = {}) =>
      JSON.parse((await btk(["demo", "x", "--json", ...args], env)).stdout).data;

    expect(await data([])).toMatchObject({ level: 2, mode: "slow" });
    p.write("btk.config.ts", `export default { tools: { demo: { level: 3 } } };`);
    expect(await data([])).toMatchObject({ level: 3, mode: "slow" });
    expect(await data([], { BTK_DEMO_LEVEL: "4" })).toMatchObject({ level: 4 });
    expect(await data(["-l", "6"], { BTK_DEMO_LEVEL: "4" })).toMatchObject({ level: 6 });
  });

  test("render() output in human and ci modes", async () => {
    fresh();
    const ci = await btk(["demo", "a.txt", "--shout"], { CI: "true" });
    expect(ci.stdout).toContain("A.TXT\t5");
    expect(ci.stdout).toContain("summary files=1 mode=fast");
    expect(ci.stdout + ci.stderr).not.toMatch(ANSI);

    const human = await btk(["demo", "a.txt"], {}, true);
    expect(human.stdout).toContain("Processed");
    expect(human.stdout).toMatch(ANSI);
  });

  test("tool config is validated as part of the config file", async () => {
    const p = fresh();
    p.write("btk.config.ts", `export default { tools: { demo: { level: 0, speed: 1 } } };`);
    const { code, stderr } = await btk(["config", "validate"]);
    expect(code).toBe(78);
    expect(stderr).toContain("tools.demo.level  Must be at least 1, received 0");
    expect(stderr).toContain("tools.demo.speed  Unknown key. Valid keys: level, mode, tags");
  });

  test("config show lists tool defaults with their source", async () => {
    fresh();
    const { stdout } = await btk(["config", "show"], { CI: "true", BTK_DEMO_MODE: "slow" });
    expect(stdout).toContain("tools.demo.level\t5\tdefault");
    expect(stdout).toContain("tools.demo.mode\tslow\tenv BTK_DEMO_MODE");
  });

  test("invalid flags exit 2 with the expected shape", async () => {
    fresh();
    const { code, stderr } = await btk(["demo", "a", "--level", "12"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Invalid value for --level: expected an integer from 1 to 9, received 12");
  });

  test("missing positional", async () => {
    fresh();
    const { code, stderr } = await btk(["demo", "process"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Missing argument <files>");
  });

  test("unknown action with a default action falls through to it", async () => {
    fresh();
    const { stdout } = await btk(["demo", "proces", "--json"]);
    expect(JSON.parse(stdout).data.files).toEqual(["proces"]);
  });

  test("unexpected errors exit 1; --verbose shows the stack", async () => {
    fresh();
    const quiet = await btk(["demo", "fail"]);
    expect(quiet.code).toBe(1);
    expect(quiet.stderr).toContain("Unexpected error: kaboom");
    expect(quiet.stderr).toContain("--verbose");
    const verbose = await btk(["demo", "fail", "--verbose"]);
    expect(verbose.stderr).toContain("fake-tool.ts");
  });

  test("--ui without a terminal exits 2 with a hint for the non-UI command", async () => {
    fresh();
    for (const args of [
      ["demo", "--ui"],
      ["demo", "process", "--ui"],
    ]) {
      const { code, stderr } = await btk(args);
      expect(code).toBe(2);
      expect(stderr).toContain("The interactive dashboard needs a terminal");
      expect(stderr).toContain('Run "btk demo --help"');
    }
  });

  test("--ui is rejected for tools without a dashboard", async () => {
    fresh();
    const { code, stderr } = await btk(["config", "--ui"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Unknown option --ui");
  });

  test("info lists installed tools", async () => {
    fresh();
    const { stdout } = await btk(["info", "--json"]);
    expect(JSON.parse(stdout).data.tools).toEqual(["demo"]);
  });
});
