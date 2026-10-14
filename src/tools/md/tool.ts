import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { UsageError } from "../../errors.ts";
import { columnsSchema, type MdConfig, mdConfig, portSchema } from "./config.ts";
import { readDocument } from "./document.ts";
import { buildPage, renderBody } from "./html/page.ts";
import { browserPreview, type PreviewResult, pageCss, terminalPreview } from "./preview.ts";
import { renderHtml, renderPreview, renderThemes } from "./render.ts";
import { availableThemes, resolveTheme } from "./theme/resolve.ts";
import { themeNameSchema } from "./theme/schema.ts";
import type { ResolvedTheme } from "./theme/types.ts";

const fileArg = positional(z.string().optional(), {
  valueHint: "file",
  description: 'Markdown file; "-" or a pipe reads standard input',
});

const themeFlag = flag(themeNameSchema, {
  alias: "t",
  config: "theme",
  valueHint: "<name>",
  description: 'Theme; see "btk md themes"',
});

const cssFlag = flag(z.string().optional(), {
  config: "css",
  valueHint: "<path>",
  description: "Extra stylesheet added after the theme's",
});

export const preview = defineAction({
  description: "Preview markdown in the browser, or in the terminal when piped",
  examples: [
    "btk md preview README.md",
    "btk md preview README.md --terminal",
    "btk md preview CHANGELOG.md --terminal | less -R",
    "btk md preview docs/guide.md --theme plain --no-open",
  ],
  args: {
    file: fileArg,
    theme: themeFlag,
    terminal: flag(z.boolean().default(false), {
      description: "Print to the terminal instead of the browser",
    }),
    browser: flag(z.boolean().default(false), { description: "Open the browser even when output is piped" }),
    open: flag(z.boolean(), { config: "open", description: "Open the browser (--no-open prints the URL)" }),
    port: flag(portSchema, { alias: "p", config: "port", description: "Server port; 0 picks a free one" }),
    columns: flag(columnsSchema.optional(), {
      config: "columns",
      valueHint: "<n>",
      description: "Terminal wrap width (default: terminal width, up to 100)",
    }),
    hyperlinks: flag(z.boolean(), { config: "hyperlinks", description: "Clickable links in the terminal" }),
    css: cssFlag,
  },
  async run(input, ctx): Promise<PreviewResult> {
    const inTerminal = wantsTerminal(input.terminal, input.browser, ctx);
    const doc = await readDocument(input.file, ctx);
    const theme = themeFor(input.theme, ctx);
    return inTerminal ? terminalPreview(doc, theme, input, ctx) : browserPreview(doc, theme, input, ctx);
  },
  render: renderPreview,
});

export type HtmlResult = { file: string; theme: string; html: string };

export const html = defineAction({
  description: "Render markdown to a standalone HTML page",
  examples: [
    "btk md html README.md > README.html",
    "btk md html notes.md --fragment",
    "cat notes.md | btk md html",
  ],
  args: {
    file: fileArg,
    theme: themeFlag,
    css: cssFlag,
    fragment: flag(z.boolean().default(false), {
      description: "Only the rendered body, without page or styles",
    }),
  },
  async run(input, ctx): Promise<HtmlResult> {
    const doc = await readDocument(input.file, ctx);
    const theme = themeFor(input.theme, ctx);
    if (input.fragment) return { file: doc.name, theme: theme.name, html: renderBody(doc.source) };
    const css = await pageCss(theme, input.css, ctx);
    const page = buildPage(doc.source, { css, fallbackTitle: doc.name, liveReload: "" }, ctx.hooks);
    return { file: doc.name, theme: theme.name, html: page };
  },
  render: renderHtml,
});

export type ThemeRow = { name: string; source: string; description: string; default: boolean };

export const themes = defineAction({
  description: "List the themes, including ones added by plugins",
  run: (_input, ctx): ThemeRow[] =>
    availableThemes(ctx.hooks).map(({ theme, source }) => ({
      name: theme.name,
      source,
      description: theme.description ?? "",
      default: theme.name === mdSettings(ctx).theme,
    })),
  render: renderThemes,
});

export const md = defineTool({
  name: "md",
  description: "Preview markdown in the browser or terminal, and render it to HTML",
  aliases: ["markdown"],
  config: mdConfig,
  defaultAction: "preview",
  actions: { preview, html, themes },
});

export function mdSettings(ctx: BtkContext): MdConfig {
  return ctx.config.tools.md as MdConfig;
}

function themeFor(name: string, ctx: BtkContext): ResolvedTheme {
  return resolveTheme(name, availableThemes(ctx.hooks));
}

/** Piped output and JSON mode get the terminal rendering, since nobody is there to look at a browser. */
function wantsTerminal(terminal: boolean, browser: boolean, ctx: BtkContext): boolean {
  if (terminal && browser) {
    throw new UsageError("--terminal and --browser can't be used together", { code: "ERR_FLAG_CONFLICT" });
  }
  if (terminal || browser) return terminal;
  return ctx.outputMode === "json" || ctx.io.stdout.isTTY !== true;
}
