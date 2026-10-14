import { resolve } from "node:path";
import type { BtkContext } from "../../context.ts";
import { BtkError } from "../../errors.ts";
import { type MdDocument, readText } from "./document.ts";
import { buildPage, LIVE_RELOAD } from "./html/page.ts";
import { openBrowser, type PreviewServer, startPreview } from "./serve.ts";
import { renderTerminal } from "./terminal/render.ts";
import type { ResolvedTheme } from "./theme/types.ts";

const MAX_AUTO_COLUMNS = 100;

export type TerminalPreview = { mode: "terminal"; file: string; theme: string; output: string };
export type BrowserPreview = { mode: "browser"; file: string; theme: string; url: string };
export type PreviewResult = TerminalPreview | BrowserPreview;

export type TerminalSettings = { columns: number | undefined; hyperlinks: boolean; terminal: boolean };
export type BrowserSettings = { css: string | undefined; port: number; open: boolean };

export function terminalPreview(
  doc: MdDocument,
  theme: ResolvedTheme,
  settings: TerminalSettings,
  ctx: BtkContext,
): TerminalPreview {
  const output = renderTerminal(doc.source, theme.terminal, {
    width: settings.columns ?? Math.min(ctx.io.stdout.columns ?? 80, MAX_AUTO_COLUMNS),
    color: terminalColor(settings.terminal, ctx),
    hyperlinks: settings.hyperlinks,
  });
  return { mode: "terminal", file: doc.name, theme: theme.name, output };
}

/** `--terminal | less -R` asks for styling, so it keeps color through a pipe unless color is off. */
function terminalColor(explicit: boolean, ctx: BtkContext): boolean {
  return ctx.reporter.out.style.enabled || (explicit && ctx.environment.color);
}

/** Serves a live preview until Ctrl+C. */
export async function browserPreview(
  doc: MdDocument,
  theme: ResolvedTheme,
  settings: BrowserSettings,
  ctx: BtkContext,
): Promise<BrowserPreview> {
  const css = await pageCss(theme, settings.css, ctx);
  const render = async () => {
    const source = doc.path ? await readText(doc.path, doc.name) : doc.source;
    return buildPage(source, { css, fallbackTitle: doc.name, liveReload: LIVE_RELOAD }, ctx.hooks);
  };
  const server = listen(doc, settings.port, render, ctx);
  announce(doc, server.url, settings.open, ctx);
  await server.closed;
  return { mode: "browser", file: doc.name, theme: theme.name, url: server.url };
}

export async function pageCss(
  theme: ResolvedTheme,
  extra: string | undefined,
  ctx: BtkContext,
): Promise<string> {
  if (!extra) return theme.css;
  return `${theme.css}\n${await readText(resolve(ctx.cwd, extra), extra)}`;
}

function listen(
  doc: MdDocument,
  port: number,
  render: () => Promise<string>,
  ctx: BtkContext,
): PreviewServer {
  try {
    return startPreview({ file: doc.path, root: ctx.cwd, port, render, signal: ctx.signal });
  } catch (error) {
    throw new BtkError(`Could not start the preview server on port ${port}`, {
      code: "ERR_PREVIEW_SERVER",
      hint: "Another program may be using the port; --port 0 picks a free one",
      cause: error,
    });
  }
}

function announce(doc: MdDocument, url: string, open: boolean, ctx: BtkContext): void {
  const { log, style } = ctx.reporter;
  log.info(`Previewing ${doc.name} at ${style.accent(url)}`);
  log.info(style.muted(doc.path ? "Reloads when you save · Ctrl+C to stop" : "Ctrl+C to stop"));
  if (open && !openBrowser(ctx.platform, url)) log.warn("Could not open a browser; open the URL yourself");
}
