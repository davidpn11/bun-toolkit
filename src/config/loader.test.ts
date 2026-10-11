import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { z } from "zod";
import { demoTool } from "../../tests/support/fake-tool.ts";
import { dotSlash } from "../../tests/support/paths.ts";
import { createTempProject, type TempProject } from "../../tests/support/tmp.ts";
import { defineTool } from "../cli/define.ts";
import { ExitCode } from "../errors.ts";
import { envVarName } from "./env.ts";
import { loadConfig } from "./loader.ts";
import { mergeLayers } from "./merge.ts";
import { findProjectConfig } from "./paths.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const load = (env: Record<string, string | undefined> = {}, explicitPath?: string, cwd?: string) =>
  loadConfig({ cwd: cwd ?? project.dir, env: { ...project.env, ...env }, tools: [demoTool], explicitPath });

const IMPORT = `import { defineConfig } from "bun-toolkit";\n`;

describe("loadConfig()", () => {
  test("no files: built-in defaults from the tool schema", async () => {
    project = createTempProject();
    const loaded = await load();
    expect(loaded.error).toBeUndefined();
    expect(loaded.files).toEqual({});
    expect(loaded.config.tools.demo).toEqual({ level: 5, mode: "fast" });
    expect(loaded.sources["tools.demo.level"]).toEqual({ kind: "default" });
  });

  test("precedence: env > project > global > defaults, with sources", async () => {
    project = createTempProject();
    const globalPath = project.writeGlobal(
      `${IMPORT}export default defineConfig({ tools: { demo: { level: 2, mode: "slow" } } } as any);`,
    );
    const projectPath = project.write(
      "btk.config.ts",
      `${IMPORT}export default defineConfig({ tools: { demo: { level: 7 } } } as any);`,
    );

    const loaded = await load();
    expect(loaded.error).toBeUndefined();
    expect(loaded.config.tools.demo).toEqual({ level: 7, mode: "slow" });
    expect(loaded.sources["tools.demo.level"]).toEqual({ kind: "project", origin: projectPath });
    expect(loaded.sources["tools.demo.mode"]).toEqual({ kind: "global", origin: globalPath });

    const withEnv = await load({ BTK_DEMO_LEVEL: "9" });
    expect(withEnv.config.tools.demo?.level).toBe(9);
    expect(withEnv.sources["tools.demo.level"]).toEqual({ kind: "env", origin: "BTK_DEMO_LEVEL" });
  });

  test("the bun-toolkit import resolves without node_modules (virtual module)", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `${IMPORT}export default defineConfig({ output: { verbose: true } });`);
    const loaded = await load();
    expect(loaded.error).toBeUndefined();
    expect(loaded.config.output.verbose).toBe(true);
  });

  test(".js and .mjs configs, and configs without defineConfig", async () => {
    project = createTempProject();
    project.write("btk.config.mjs", `export default { output: { json: true } };`);
    expect((await load()).config.output.json).toBe(true);
  });

  test("project config is found from a subdirectory", async () => {
    project = createTempProject();
    const path = project.write("btk.config.ts", `export default {};`);
    const deep = join(project.dir, "a", "b");
    project.write("a/b/.keep", "");
    expect(findProjectConfig(deep, project.env)).toBe(path);
    expect((await load({}, undefined, deep)).files.project?.path).toBe(path);
  });

  test("--config replaces discovery; a missing file is an error", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `export default { tools: { demo: { level: 1 } } };`);
    const ci = project.write("ci/custom.ts", `export default { tools: { demo: { level: 8 } } };`);
    expect((await load({}, ci)).config.tools.demo?.level).toBe(8);

    const missing = await load({}, "nope.ts");
    expect(missing.error?.message).toBe("Could not load the configuration");
    expect(missing.error?.details.join("\n")).toContain("File not found (from --config)");
  });

  test("every problem is reported, grouped by file, with suggestions", async () => {
    project = createTempProject();
    project.writeGlobal(`export default { output: { verbose: "yes" } };`);
    project.write(
      "btk.config.ts",
      `export default { tools: { demo: { level: 50, mode: "turbo", levl: 1 }, dmeo: {} }, toolz: 1 };`,
    );
    const { error, files } = await load();
    expect(error?.exitCode).toBe(ExitCode.Config);
    expect(error?.code).toBe("ERR_CONFIG_INVALID");
    expect(error?.message).toBe("Invalid configuration (6 problems)");
    expect(files.global?.status).toBe("invalid");
    expect(files.project?.status).toBe("invalid");

    const text = error?.details.join("\n") ?? "";
    expect(text).toContain("(global)");
    expect(text).toContain('output.verbose  Expected boolean, received "yes"');
    expect(text).toContain("tools.demo.level  Must be at most 9, received 50");
    expect(text).toContain('tools.demo.mode   Expected one of "fast", "slow", received "turbo"');
    expect(text).toContain('tools.demo.levl   Unknown key. Did you mean "level"?');
    expect(text).toContain('tools.dmeo        Unknown tool. Did you mean "demo"?');
    expect(text).toContain('toolz             Unknown key. Did you mean "tools"?');
  });

  test("an invalid file does not poison the valid one", async () => {
    project = createTempProject();
    project.writeGlobal(`export default { tools: { demo: { mode: "slow" } } };`);
    project.write("btk.config.ts", `export default { tools: { demo: { level: 99 } } };`);
    const loaded = await load();
    expect(loaded.error).toBeDefined();
    expect(loaded.config.tools.demo).toEqual({ level: 5, mode: "slow" });
  });

  test("syntax errors and throwing configs are load errors with a position", async () => {
    project = createTempProject();
    project.write("btk.config.ts", "export default {\n  a: 1,\n  b: \n");
    const { error, files } = await load();
    expect(files.project?.status).toBe("unreadable");
    expect(error?.code).toBe("ERR_CONFIG_LOAD");
    expect(error?.details.join("\n")).toMatch(/line \d+, column \d+/);

    project.cleanup();
    project = createTempProject();
    project.write("btk.config.ts", `throw new Error("config exploded");`);
    expect((await load()).error?.details.join("\n")).toContain("config exploded");
  });

  test("the default export must be an object", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `export default 42;`);
    expect((await load()).error?.details.join("\n")).toContain("must be an object");
  });

  test("invalid env values are config errors", async () => {
    project = createTempProject();
    const { error } = await load({ BTK_DEMO_LEVEL: "high", BTK_VERBOSE: "maybe" });
    const text = error?.details.join("\n") ?? "";
    expect(text).toContain("Environment variables");
    expect(text).toContain('BTK_DEMO_LEVEL  Expected an integer from 1 to 9, received "high"');
    expect(text).toContain("BTK_VERBOSE");
  });

  test("rules that only fail once layers are combined are reported, not swallowed", async () => {
    project = createTempProject();
    const ranged = defineTool({
      name: "ranged",
      description: "Cross-field rule",
      config: z
        .object({ min: z.number().default(0), max: z.number().default(10) })
        .refine((c) => c.min <= c.max, {
          message: "min must not exceed max",
        }),
      actions: {},
    });
    project.writeGlobal(`export default { tools: { ranged: { min: 5 } } };`);
    project.write("btk.config.ts", `export default { tools: { ranged: { max: 2 } } };`);
    const loaded = await loadConfig({ cwd: project.dir, env: project.env, tools: [ranged] });
    expect(loaded.error?.details.join("\n")).toContain("tools.ranged  min must not exceed max");
    expect(loaded.config.tools.ranged).toEqual({ min: 0, max: 10 });
  });

  test("env arrays are comma separated", async () => {
    project = createTempProject();
    expect((await load({ BTK_DEMO_TAGS: "a, b" })).config.tools.demo?.tags).toEqual(["a", "b"]);
  });

  test("plugins from both tiers are concatenated", async () => {
    project = createTempProject();
    project.writeGlobal(`export default { plugins: [{ name: "g", setup() {} }] };`);
    project.write("btk.config.ts", `export default { plugins: [{ name: "p", setup() {} }] };`);
    expect((await load()).config.plugins.map((p) => p.name)).toEqual(["g", "p"]);
  });
});

describe("JSON configs", () => {
  test("btk.config.json and bun-toolkit.config.json are found; btk.config.* wins in the same folder", async () => {
    project = createTempProject();
    const named = project.write("bun-toolkit.config.json", `{ "tools": { "demo": { "level": 3 } } }`);
    expect((await load()).config.tools.demo?.level).toBe(3);
    expect(findProjectConfig(project.dir, project.env)).toBe(named);

    const short = project.write("btk.config.json", `{ "tools": { "demo": { "level": 4 } } }`);
    expect(findProjectConfig(project.dir, project.env)).toBe(short);

    const ts = project.write("btk.config.ts", `export default { tools: { demo: { level: 6 } } };`);
    expect(findProjectConfig(project.dir, project.env)).toBe(ts);
  });

  test("a global config.json loads, and comments and trailing commas are allowed", async () => {
    project = createTempProject();
    const path = project.writeGlobal(
      `// personal defaults\n{ "tools": { "demo": { "mode": "slow", } } }`,
      "config.json",
    );
    const loaded = await load();
    expect(loaded.error).toBeUndefined();
    expect(loaded.sources["tools.demo.mode"]).toEqual({ kind: "global", origin: path });
  });

  test("invalid JSON is a load error that names the file", async () => {
    project = createTempProject();
    project.write("btk.config.json", `{ "tools": `);
    const { error, files } = await load();
    expect(files.project?.status).toBe("unreadable");
    expect(error?.details.join("\n")).toContain(`${dotSlash("btk.config.json")} (project)`);
    expect(error?.details.join("\n")).toContain("Invalid JSON");
  });

  test("a JSON config must hold an object", async () => {
    project = createTempProject();
    project.write("btk.config.json", `[1, 2]`);
    expect((await load()).error?.details.join("\n")).toContain("must contain a JSON object");
  });
});

describe("noLocalConfig", () => {
  test("defaults to warn; set from the global config or BTK_NO_LOCAL_CONFIG", async () => {
    project = createTempProject();
    const env = { BTK_NO_LOCAL_CONFIG: "" };
    expect((await load(env)).config.noLocalConfig).toBe("warn");

    const path = project.writeGlobal(`{ "noLocalConfig": "error" }`, "config.json");
    const loaded = await load(env);
    expect(loaded.config.noLocalConfig).toBe("error");
    expect(loaded.sources.noLocalConfig).toEqual({ kind: "global", origin: path });

    const fromEnv = await load({ BTK_NO_LOCAL_CONFIG: "off" });
    expect(fromEnv.config.noLocalConfig).toBe("off");
    expect(fromEnv.sources.noLocalConfig).toEqual({ kind: "env", origin: "BTK_NO_LOCAL_CONFIG" });
  });

  test("is rejected in a project config and validated in env", async () => {
    project = createTempProject();
    project.write("btk.config.json", `{ "noLocalConfig": "off" }`);
    const text = (await load({ BTK_NO_LOCAL_CONFIG: "loud" })).error?.details.join("\n") ?? "";
    expect(text).toContain("noLocalConfig  Only allowed in the global config");
    expect(text).toContain('BTK_NO_LOCAL_CONFIG  Expected warn, off, error, received "loud"');
  });
});

describe("mergeLayers()", () => {
  test("objects merge, arrays replace (except plugins), sources track the winner", () => {
    const { values, sources } = mergeLayers([
      { source: { kind: "default" }, values: { tools: { x: { a: 1, list: [1] } } } },
      { source: { kind: "project", origin: "p" }, values: { tools: { x: { list: [2] } } } },
    ]);
    expect(values).toEqual({ tools: { x: { a: 1, list: [2] } } });
    expect(sources["tools.x.a"]?.kind).toBe("default");
    expect(sources["tools.x.list"]?.kind).toBe("project");
  });
});

describe("envVarName()", () => {
  test("camelCase keys become SNAKE_CASE", () => {
    expect(envVarName("image", "quality")).toBe("BTK_IMAGE_QUALITY");
    expect(envVarName("image", "maxWidth")).toBe("BTK_IMAGE_MAX_WIDTH");
  });
});
