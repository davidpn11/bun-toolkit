import { afterEach, describe, expect, test } from "bun:test";
import { runBtk } from "../support/cli.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

const README = "# Title\n\nSome **bold** text.\n\n- one\n- two\n";

const OCEAN_PLUGIN = `
import { definePlugin, defineTheme } from "bun-toolkit";

const ocean = defineTheme({
  name: "ocean",
  description: "Blue",
  terminal: { glyphs: { bullets: ["→"] } },
  css: "h1 { color: blue; }",
});

export const oceanPlugin = definePlugin(() => ({
  name: "ocean-plugin",
  setup(hooks) {
    hooks.on("md:theme", () => ocean);
  },
}));
`;

describe("btk md", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("README.md", README);
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

  test("preview prints the terminal rendering when stdout is piped", async () => {
    setup();
    const { code, stdout, stderr } = await btk(["md", "README.md"]);
    expect(code).toBe(0);
    expect(stdout).toBe("Title\n─────\n\nSome bold text.\n\n  • one\n  • two\n");
    expect(stderr).toBe("");
  });

  test("a terminal gets ANSI; CI and NO_COLOR do not", async () => {
    setup();
    expect((await btk(["md", "preview", "README.md", "--terminal"], { tty: true })).stdout).toMatch(ANSI);
    expect(
      (await btk(["md", "README.md", "--terminal"], { tty: true, env: { CI: "true" } })).stdout,
    ).not.toMatch(ANSI);
    expect((await btk(["md", "README.md"], { env: { NO_COLOR: "1" } })).stdout).not.toMatch(ANSI);
  });

  test("reads standard input from a pipe or -", async () => {
    setup();
    expect((await btk(["md"], { stdin: "# Piped" })).stdout).toBe("Piped\n─────\n");
    expect((await btk(["md", "html", "-", "--fragment"], { stdin: "*hi*" })).stdout).toBe(
      "<p><em>hi</em></p>\n",
    );
  });

  test("--json returns the rendering, plain", async () => {
    setup();
    const { code, stdout } = await btk(["md", "README.md", "--json", "--columns", "30"]);
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout);
    expect(envelope).toMatchObject({
      ok: true,
      command: "md preview",
      data: { mode: "terminal", file: "README.md", theme: "btk" },
    });
    expect(envelope.data.output).not.toMatch(ANSI);
  });

  test("html writes a standalone page, or only the body with --fragment", async () => {
    const p = setup();
    p.write("extra.css", "main { max-width: 1px; }");
    const page = await btk(["md", "html", "README.md", "--css", "extra.css"]);
    expect(page.code).toBe(0);
    expect(page.stdout).toStartWith("<!doctype html>");
    expect(page.stdout).toContain("<title>Title</title>");
    expect(page.stdout).toContain("main { max-width: 1px; }");
    expect(page.stdout).not.toContain("EventSource");

    const fragment = await btk(["md", "html", "README.md", "--fragment"]);
    expect(fragment.stdout).toStartWith('<h1 id="title">Title</h1>');

    const json = JSON.parse((await btk(["md", "html", "README.md", "--json"])).stdout);
    expect(json.data.html).toStartWith("<!doctype html>");
  });

  test("the theme comes from config, env, then the flag", async () => {
    const p = setup();
    const bullets = async (args: string[], env?: Record<string, string>) =>
      (await btk(["md", "README.md", ...args], { env })).stdout.includes("  * one");
    expect(await bullets([])).toBe(false);
    p.write("btk.config.ts", `export default { tools: { md: { theme: "plain" } } };`);
    expect(await bullets([])).toBe(true);
    expect(await bullets([], { BTK_MD_THEME: "btk" })).toBe(false);
    expect(await bullets(["--theme", "plain"], { BTK_MD_THEME: "btk" })).toBe(true);
  });

  test("an unknown theme exits 2 with a suggestion", async () => {
    setup();
    const { code, stderr } = await btk(["md", "README.md", "-t", "plian"]);
    expect(code).toBe(2);
    expect(stderr).toContain('Unknown theme "plian"');
    expect(stderr).toContain('Did you mean "plain"?');
  });

  test("a missing file fails; no input at all is a usage error", async () => {
    setup();
    expect((await btk(["md", "nope.md"])).code).toBe(1);
    const empty = await btk(["md"], { tty: true });
    expect(empty.code).toBe(2);
    expect(empty.stderr).toContain("No markdown file given");
  });

  test("--terminal and --browser together is a usage error", async () => {
    setup();
    expect((await btk(["md", "README.md", "--terminal", "--browser"])).code).toBe(2);
  });

  test("themes lists built-in and plugin themes", async () => {
    const p = setup();
    p.write("ocean.ts", OCEAN_PLUGIN);
    p.write(
      "btk.config.ts",
      `import { oceanPlugin } from "./ocean.ts";\nexport default { plugins: [oceanPlugin()], tools: { md: { theme: "ocean" } } };`,
    );
    const { code, stdout } = await btk(["md", "themes", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).data).toEqual([
      { name: "btk", source: "built-in", description: "Bun pink accents, light and dark", default: false },
      {
        name: "plain",
        source: "built-in",
        description: "No colors and ASCII characters, for piping and printing",
        default: false,
      },
      { name: "ocean", source: "ocean-plugin", description: "Blue", default: true },
    ]);
  });

  test("a plugin theme styles both the terminal and the page", async () => {
    const p = setup();
    p.write("ocean.ts", OCEAN_PLUGIN);
    p.write(
      "btk.config.ts",
      `import { oceanPlugin } from "./ocean.ts";\nexport default { plugins: [oceanPlugin()] };`,
    );
    expect((await btk(["md", "README.md", "--theme", "ocean"])).stdout).toContain("  → one");
    expect((await btk(["md", "html", "README.md", "-t", "ocean"])).stdout).toContain("h1 { color: blue; }");
  });

  test("plugins from the global and the project config both load", async () => {
    const p = setup();
    const plugin = (name: string) =>
      `{ name: "${name}", setup(h) { h.on("md:theme", () => ({ name: "${name}" })); } }`;
    p.writeGlobal(`export default { plugins: [${plugin("global-theme")}] };`);
    p.write("btk.config.ts", `export default { plugins: [${plugin("project-theme")}] };`);
    const names = JSON.parse((await btk(["md", "themes", "--json"])).stdout).data.map(
      (t: { name: string }) => t.name,
    );
    expect(names).toEqual(["btk", "plain", "global-theme", "project-theme"]);
  });

  test("a plugin whose setup throws fails md with its name; other tools still run", async () => {
    const p = setup();
    p.write(
      "btk.config.ts",
      `export default { plugins: [{ name: "broken", setup() { throw new Error("boom"); } }] };`,
    );
    const { code, stderr } = await btk(["md", "README.md"]);
    expect(code).toBe(1);
    expect(stderr).toContain('Plugin "broken" failed in setup(): boom');
    expect((await btk(["hash", "README.md"])).code).toBe(0);
  });

  test("help covers the tool and each action", async () => {
    setup();
    const tool = await btk(["md", "--help"]);
    expect(tool.code).toBe(0);
    for (const action of ["preview", "html", "themes"]) expect(tool.stdout).toContain(action);
    const preview = (await btk(["md", "preview", "--help"])).stdout;
    for (const flag of ["--theme", "--terminal", "--no-open", "--port", "--columns"])
      expect(preview).toContain(flag);
    expect((await btk(["md", "html", "--help"])).stdout).toContain("--fragment");
  });
});
