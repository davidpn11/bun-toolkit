import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { BtkError, UsageError } from "../../errors.ts";
import { createHooks, noHooks } from "../../plugins/loader.ts";
import type { BtkPlugin } from "../../plugins/types.ts";
import { highlight } from "./highlight.ts";
import { buildPage, pageTitle, renderBody } from "./html/page.ts";
import { EVENTS_PATH, openCommand, startPreview } from "./serve.ts";
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
    const options = { css: "body{color:red}", fallbackTitle: "f", liveReload: "<!--reload-->" };
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
});

describe("preview server", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  test("serves the page, files next to it, and reload events when the file changes", async () => {
    project = createTempProject();
    const file = project.write("doc.md", "# One");
    project.write("logo.svg", "<svg/>");
    const stop = new AbortController();
    const server = startPreview({
      file,
      root: project.dir,
      port: 0,
      render: async () => Bun.file(file).text(),
      signal: stop.signal,
    });

    expect(await (await fetch(server.url)).text()).toBe("# One");
    expect(await (await fetch(`${server.url}logo.svg`)).text()).toBe("<svg/>");
    expect((await fetch(`${server.url}%2e%2e/secret`)).status).toBe(404);
    expect((await fetch(`${server.url}missing.png`)).status).toBe(404);

    const events = await fetch(new URL(EVENTS_PATH, server.url));
    const reader = (events.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    appendFileSync(join(project.dir, "doc.md"), "\nmore");
    expect(await readUntil(reader, "event: reload")).toBe(true);

    await reader.cancel();
    stop.abort();
    await server.closed;
  });

  test("opens the browser with each platform's command", () => {
    expect(openCommand("darwin", "u")).toEqual(["open", "u"]);
    expect(openCommand("win32", "u")).toEqual(["cmd", "/c", "start", "", "u"]);
    expect(openCommand("linux", "u")).toEqual(["xdg-open", "u"]);
  });
});

async function readUntil(
  reader: { read(): Promise<{ value?: Uint8Array; done: boolean }> },
  text: string,
): Promise<boolean> {
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes(text)) {
    const { value, done } = await reader.read();
    if (done) return false;
    seen += decoder.decode(value);
  }
  return true;
}
