import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createTestContext } from "../../../tests/support/context.ts";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { BtkError, UsageError } from "../../errors.ts";
import { createHooks, noHooks } from "../../plugins/loader.ts";
import type { BtkPlugin } from "../../plugins/types.ts";
import { buildSite } from "./build.ts";
import { splitFrontMatter } from "./front-matter.ts";
import { highlight } from "./highlight.ts";
import { buildPage, LIVE_RELOAD, pageTitle, renderBody } from "./html/page.ts";
import { folderBody, listPages, pageHref, renderNav, resolveTarget, titleOf } from "./site.ts";
import { renderTerminal } from "./terminal/render.ts";
import { BTK_THEME } from "./theme/builtin.ts";
import { availableThemes, resolveTheme } from "./theme/resolve.ts";
import type { MdTheme } from "./theme/types.ts";
import { parseMarkdown } from "./tree.ts";

const ESC = String.fromCharCode(27);
const plainText = (markdown: string, width = 40) =>
  renderTerminal(markdown, BTK_THEME.terminal, { width, color: false, hyperlinks: false });

function themesFrom(...themes: MdTheme[]) {
  const plugin: BtkPlugin = { name: "test-plugin", setup: (h) => h.on("md:theme", () => themes) };
  return availableThemes(createHooks([plugin], { warn: () => {} }));
}

describe("front matter", () => {
  test("YAML between --- lines at the top is split off, and its title read", () => {
    expect(splitFrontMatter("---\ntitle: Guide\ntags: [a]\n---\n# Body\n")).toEqual({
      body: "# Body\n",
      title: "Guide",
    });
    expect(splitFrontMatter("\uFEFF---\r\nlayout: page\r\n---\r\ntext")).toEqual({
      body: "text",
      title: undefined,
    });
    expect(splitFrontMatter("---\n---\ntext").body).toBe("text");
  });

  test("a block that isn't a YAML mapping stays, so leading rules still render", () => {
    const rules = "---\n\nJust text.\n\n---\n";
    expect(splitFrontMatter(rules).body).toBe(rules);
    expect(splitFrontMatter("---\nkey: [unclosed\n---\nx").body).toStartWith("---");
    expect(splitFrontMatter("text\n---\na: 1\n---\n").body).toStartWith("text");
  });

  test("terminal, page and sidebar all skip it, and the title wins over the heading", () => {
    const source = "---\ntitle: From YAML\n---\n# Heading\n";
    expect(plainText(source)).toBe("Heading\n───────");
    expect(buildPage(source, { css: "", fallbackTitle: "f", liveReload: "", nav: "" }, noHooks)).toContain(
      "<title>From YAML</title>",
    );
    expect(titleOf(source, "x.md")).toBe("From YAML");
  });
});

describe("highlight", () => {
  test("maps Bun's highlighter colors to token kinds", () => {
    expect(highlight("// hi\nconst n: number = 1;\n", "ts")).toEqual([
      [{ text: "// hi", kind: "comment" }],
      [
        { text: "const", kind: "keyword" },
        { text: " n: " },
        { text: "number", kind: "type" },
        { text: " = " },
        { text: "1", kind: "literal" },
        { text: ";", kind: "punctuation" },
      ],
    ]);
    expect(highlight('x = "s"', "js")[0]).toContainEqual({ text: '"s"', kind: "string" });
  });

  test("other languages, no language and backticks in the code come back as plain text", () => {
    expect(highlight("x = 1\n", "python")).toEqual([[{ text: "x = 1" }]]);
    expect(highlight("a\n\nb", undefined)).toEqual([[{ text: "a" }], [], [{ text: "b" }]]);
    expect(
      highlight("const a = ```;", "ts")
        .flat()
        .map((t) => t.text)
        .join(""),
    ).toBe("const a = ```;");
  });
});

describe("parseMarkdown", () => {
  test("builds a tree with each element's metadata", () => {
    const [heading, list] = parseMarkdown("## Title\n\n- [x] done\n");
    expect(heading).toMatchObject({ type: "heading", meta: { level: 2 } });
    expect(heading?.children).toEqual([{ type: "text", children: [], text: "Title", meta: {} }]);
    expect(list?.children[0]).toMatchObject({ type: "listItem", meta: { checked: true } });
  });

  test("soft line breaks become break nodes", () => {
    const [paragraph] = parseMarkdown("one\ntwo\n");
    expect(paragraph?.children.map((n) => n.type)).toEqual(["text", "break", "text"]);
  });
});

describe("themes", () => {
  test("built-in themes come first and the default is btk", () => {
    expect(availableThemes(noHooks).map((e) => [e.theme.name, e.source])).toEqual([
      ["btk", "built-in"],
      ["plain", "built-in"],
    ]);
  });

  test("a partial theme fills in from btk, and css replaces btk's page styles", () => {
    const theme = resolveTheme(
      "mine",
      themesFrom({ name: "mine", terminal: { strong: { color: "red" } }, css: "body{}" }),
    );
    expect(theme.source).toBe("test-plugin");
    expect(theme.terminal.strong).toEqual({ color: "red" });
    expect(theme.terminal.emphasis).toEqual(BTK_THEME.terminal.emphasis);
    expect(theme.css).toBe("body{}");
  });

  test("extends merges grouped sections and adds css after the base theme's", () => {
    const theme = resolveTheme(
      "kid",
      themesFrom(
        { name: "parent", extends: "plain", terminal: { glyphs: { taskDone: "☑" } }, css: "a{}" },
        { name: "kid", extends: "parent", terminal: { glyphs: { quote: "┃" } }, css: "b{}" },
      ),
    );
    expect(theme.terminal.glyphs).toMatchObject({ box: "ascii", taskDone: "☑", quote: "┃" });
    expect(theme.css.endsWith("a{}\nb{}")).toBe(true);
  });

  test("a plugin theme can replace a built-in one by name", () => {
    expect(resolveTheme("btk", themesFrom({ name: "btk", css: "x{}" })).css).toBe("x{}");
  });

  test("unknown names suggest the closest theme", () => {
    expect(() => resolveTheme("plian", availableThemes(noHooks))).toThrow(UsageError);
    try {
      resolveTheme("plian", availableThemes(noHooks));
    } catch (error) {
      expect((error as UsageError).hint).toBe('Did you mean "plain"?');
    }
  });

  test("invalid plugin themes and extends loops are reported", () => {
    expect(() => themesFrom({ name: "Bad Name" })).toThrow(
      'Theme "Bad Name" from plugin "test-plugin" is invalid',
    );
    expect(() => themesFrom({ name: "x", terminal: { strong: { color: "teal" } } })).toThrow(BtkError);
    const loop = themesFrom({ name: "a", extends: "b" }, { name: "b", extends: "a" });
    expect(() => resolveTheme("a", loop)).toThrow("Themes extend each other in a loop: a → b → a");
  });
});

describe("renderTerminal", () => {
  test("with color off there are no escape codes", () => {
    const out = plainText("# Hi\n\n**bold** [link](https://bun.sh)\n\n```ts\nconst a = 1;\n```\n");
    expect(out).not.toContain(ESC);
    expect(out).toContain("bold link (https://bun.sh)");
    expect(out).toContain("│ const a = 1;");
  });

  test("with color on the theme paints the text", () => {
    const out = renderTerminal("**bold**", BTK_THEME.terminal, { width: 40, color: true, hyperlinks: false });
    expect(out).toBe(`${ESC}[1mbold${ESC}[22m`);
  });

  test("paragraphs wrap at the width, and list items keep their indent", () => {
    const out = plainText(`${"word ".repeat(12)}\n\n- ${"item ".repeat(10)}\n`, 30);
    for (const line of out.split("\n")) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(30);
    expect(out).toContain("\n  • item item");
    expect(out).toMatch(/\n {4}item/);
  });

  test("tables align their columns", () => {
    const out = plainText("| a | b |\n|:--|--:|\n| long | 1 |\n");
    expect(out).toBe(
      ["╭──────┬───╮", "│ a    │ b │", "├──────┼───┤", "│ long │ 1 │", "╰──────┴───╯"].join("\n"),
    );
  });

  test("tasks, numbers and nesting get their own markers", () => {
    const out = plainText("- [x] done\n- [ ] todo\n\n3. three\n4. four\n   - inner\n");
    expect(out).toContain("  ✔ done\n  ○ todo");
    expect(out).toContain("  3. three\n  4. four\n     ◦ inner");
  });

  test("hyperlinks wrap the label in OSC 8 when color is on", () => {
    const out = renderTerminal("[x](https://a.b)", BTK_THEME.terminal, {
      width: 40,
      color: true,
      hyperlinks: true,
    });
    expect(out).toContain(`${ESC}]8;;https://a.b${ESC}\\`);
  });
});

describe("html", () => {
  test("code blocks get token spans and HTML is escaped", () => {
    const body = renderBody('```ts\nconst a = "<x>";\n```\n');
    expect(body).toContain('<span class="tok-keyword">const</span>');
    expect(body).toContain('<span class="tok-string">&quot;&lt;x&gt;&quot;</span>');
  });

  test("dangerous tags are filtered", () => {
    expect(renderBody("<script>alert(1)</script>\n")).not.toContain("<script>");
  });

  test("the title comes from the first level 1 heading", () => {
    expect(pageTitle(renderBody("intro\n\n# The *Title*\n"), "x.md")).toBe("The Title");
    expect(pageTitle(renderBody("no heading"), "x.md")).toBe("x.md");
  });

  test("the built-in page includes the css; a plugin template replaces it", () => {
    const options = { css: "body{color:red}", fallbackTitle: "f", liveReload: "<!--reload-->", nav: "" };
    const page = buildPage("# Hi", options, noHooks);
    expect(page).toStartWith("<!doctype html>");
    expect(page).toContain("<style>body{color:red}</style>");
    expect(page).toContain("<!--reload-->");

    const template: BtkPlugin = {
      name: "tpl",
      setup: (h) => h.on("md:html:template", ({ title, body, css }) => `${title}|${css}|${body.trim()}`),
    };
    const custom = buildPage("# Hi", options, createHooks([template], { warn: () => {} }));
    expect(custom).toBe('Hi|body{color:red}|<h1 id="hi">Hi</h1>');
  });

  test("only the live reload script may run, and --css can't close the style tag", () => {
    const options = {
      css: "</style><script>x()</script>",
      fallbackTitle: "f",
      liveReload: LIVE_RELOAD,
      nav: "",
    };
    const page = buildPage("<img src=x onerror=alert(1)>", options, noHooks);
    const script = LIVE_RELOAD.slice("<script>".length, -"</script>".length);
    const hash = new Bun.CryptoHasher("sha256").update(script).digest("base64");
    expect(page).toContain(`content="script-src 'sha256-${hash}'; object-src 'none'; base-uri 'none'"`);
    expect(page).toContain("<style><\\/style><script>x()</script></style>");
  });

  test("a page with navigation gets the sidebar layout", () => {
    const options = { css: "", fallbackTitle: "f", liveReload: "", nav: "<ul><li>x</li></ul>" };
    const page = buildPage("# Hi", options, noHooks);
    expect(page).toContain('<div class="btk-site">\n<nav class="btk-nav"><ul><li>x</li></ul></nav>\n<main>');
    expect(page).toContain(".btk-site {");
    expect(buildPage("# Hi", { ...options, nav: "" }, noHooks)).not.toContain("btk-site");
  });
});

describe("site", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const site = () => {
    project = createTempProject();
    project.write("README.md", "# Home\n");
    project.write("guide.md", "# The [Guide](x) *page*\n");
    project.write("tools/b.md", "no heading");
    project.write("tools/index.md", "# Tools\n");
    project.write("api/a.md", "# A\n");
    project.write("node_modules/pkg/README.md", "# Hidden\n");
    project.write(".changeset/x.md", "# Hidden\n");
    project.write("logo.png", "png");
    return project.dir;
  };

  test("lists pages: root first, index pages first, skipping node_modules and dot folders", async () => {
    expect(await listPages(site())).toEqual([
      { path: "README.md", title: "Home" },
      { path: "guide.md", title: "The Guide page" },
      { path: "api/a.md", title: "A" },
      { path: "tools/index.md", title: "Tools" },
      { path: "tools/b.md", title: "b" },
    ]);
  });

  test("resolves URLs to pages, folder indexes, listings and redirects", () => {
    const root = site();
    project.write("empty/notes.txt", "");
    expect(resolveTarget(root, "/")).toMatchObject({ kind: "page", path: "README.md" });
    expect(resolveTarget(root, "/guide.md")).toMatchObject({ kind: "page", path: "guide.md" });
    expect(resolveTarget(root, "/tools/")).toMatchObject({ kind: "page", path: "tools/index.md" });
    expect(resolveTarget(root, "/tools")).toEqual({ kind: "redirect", location: "/tools/" });
    expect(resolveTarget(root, "/api/")).toEqual({ kind: "folder", dir: "api" });
    expect(resolveTarget(root, "/logo.png")).toBeUndefined();
    expect(resolveTarget(root, "/missing.md")).toBeUndefined();
    expect(resolveTarget(root, "/%2e%2e/")).toBeUndefined();
  });

  test("index and page symlinks that lead out of the root are ignored", async () => {
    const root = site();
    const outside = project.write("../outside.md", "# Secret\n");
    symlinkSync(outside, join(root, "api/README.md"));
    symlinkSync(outside, join(root, "leak.md"));
    expect(resolveTarget(root, "/api/")).toEqual({ kind: "folder", dir: "api" });
    expect((await listPages(root)).map((page) => page.path)).not.toContain("leak.md");
    expect(resolveTarget(root, "//api")).toEqual({ kind: "redirect", location: "/api/" });
  });

  test("the sidebar groups pages by folder and marks the current page", async () => {
    const nav = renderNav(await listPages(site()), "guide.md");
    expect(nav).toContain('<a href="/guide.md" aria-current="page">The Guide page</a>');
    expect(nav).toContain(
      '<span class="btk-nav-folder">tools</span><ul><li><a href="/tools/index.md">Tools</a>',
    );
    expect(nav.indexOf("README.md")).toBeLessThan(nav.indexOf("api/a.md"));
  });

  test("a folder without an index lists its pages", async () => {
    const body = folderBody("api", await listPages(site()));
    expect(body).toContain("<h1>api</h1>");
    expect(body).toContain('<a href="/api/a.md">A</a>');
    expect(body).not.toContain("guide.md");
  });

  test("titles fall back to the file name, and links encode each segment", () => {
    expect(titleOf("text only", "notes/my file.md")).toBe("my file");
    expect(titleOf("## Not level one\n# Real", "x.md")).toBe("Real");
    expect(pageHref("notes/my file.md")).toBe("/notes/my%20file.md");
  });
});

describe("build", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const build = async (settings: { out?: string; overwrite?: boolean; dryRun?: boolean } = {}) => {
    const ctx = await createTestContext({ cwd: project.dir });
    const options = { out: "docs/site", overwrite: false, dryRun: false, ...settings };
    return buildSite("docs", resolveTheme("plain", availableThemes(noHooks)), options, ctx);
  };
  const read = (path: string) => readFileSync(join(project.dir, "docs/site", path), "utf8");

  test("writes pages, index pages and folder lists with links relative to each page", async () => {
    project = createTempProject();
    project.write("docs/README.md", "# Home\n\nSee [the guide](guide.md#setup) and ![logo](img/logo.png).\n");
    project.write("docs/guide.md", "# Guide\n\n[Tools](tools/README.md) and [api](api/).\n");
    project.write("docs/tools/README.md", "# Tools\n");
    project.write("docs/api/a.md", "# A\n");
    project.write("docs/img/logo.png", "png");
    project.write("docs/.private/notes.txt", "secret");
    symlinkSync(project.write("outside.txt", "secret"), join(project.dir, "docs/leak.txt"));

    expect(await build()).toMatchObject({ mode: "build", pages: 4, folders: 1, assets: 1, dryRun: false });
    expect(read("index.html")).toContain('<a href="guide.html#setup">');
    expect(read("index.html")).toContain('src="img/logo.png"');
    expect(read("guide.html")).toContain('<a href="tools/index.html">Tools</a>');
    expect(read("guide.html")).toContain('<a href="api/index.html">api</a>');
    expect(read("tools/index.html")).toContain('<a href="../guide.html">Guide</a>');
    expect(read("api/index.html")).toContain('<a href="a.html">A</a>');
    expect(read("img/logo.png")).toBe("png");
    expect(existsSync(join(project.dir, "docs/site/.private"))).toBe(false);
    expect(existsSync(join(project.dir, "docs/site/leak.txt"))).toBe(false);

    await expect(build()).rejects.toThrow(UsageError);
    expect(await build({ overwrite: true })).toMatchObject({ pages: 4, assets: 1 });
  });

  test("refuses two files that would land on the same output path", async () => {
    project = createTempProject();
    project.write("docs/README.md", "# Home\n");
    project.write("docs/index.md", "# Index\n");
    await expect(build()).rejects.toThrow("Two files would be written to index.html");
    expect(existsSync(join(project.dir, "docs/site"))).toBe(false);
  });

  test("copies assets when the output folder contains the source", async () => {
    project = createTempProject();
    project.write("docs/a.md", "# A\n");
    project.write("docs/img/logo.png", "png");
    expect(await build({ out: ".", overwrite: true })).toMatchObject({ assets: 1 });
  });

  test("a dry run counts without writing", async () => {
    project = createTempProject();
    project.write("docs/a.md", "# A\n");
    expect(await build({ dryRun: true })).toMatchObject({ pages: 1, folders: 1, dryRun: true });
    expect(existsSync(join(project.dir, "docs/site"))).toBe(false);
  });
});
