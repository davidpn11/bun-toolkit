import { dirname, resolve } from "node:path";
import type { BtkContext } from "../../context.ts";
import { htmlResponse, serveUntilStopped, watchOneFile } from "../../shared/serve.ts";
import { type MdDocument, readText } from "./document.ts";
import { buildPage, LIVE_RELOAD } from "./html/page.ts";
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

export async function browserPreview(
  doc: MdDocument,
  theme: ResolvedTheme,
  settings: BrowserSettings,
  ctx: BtkContext,
): Promise<BrowserPreview> {
  const root = doc.path ? dirname(doc.path) : ctx.cwd;
  const page = async (pathname: string) => {
    if (pathname !== "/") return undefined;
    const source = doc.path ? await readText(doc.path, doc.name) : doc.source;
    const css = await pageCss(theme, settings.css, ctx);
    const options = { css, fallbackTitle: doc.name, liveReload: LIVE_RELOAD, nav: "" };
    return htmlResponse(buildPage(source, options, ctx.hooks));
  };
  const watch = doc.path ? watchOneFile(root, doc.path) : undefined;
  const { url } = await serveUntilStopped(
    { root, watch, port: settings.port, page },
    settings.open,
    ctx,
    (_, link) => announce(`Previewing ${doc.name} at ${link}`, Boolean(doc.path), ctx),
  );
  return { mode: "browser", file: doc.name, theme: theme.name, url };
}

/** The theme's stylesheet plus `--css`, read on every request so edits show on the next reload. */
export async function pageCss(
  theme: ResolvedTheme,
  extra: string | undefined,
  ctx: BtkContext,
): Promise<string> {
  if (!extra) return theme.css;
  return `${theme.css}\n${await readText(resolve(ctx.cwd, extra), extra)}`;
}

export function announce(message: string, reloads: boolean, ctx: BtkContext): void {
  const { log, style } = ctx.reporter;
  log.info(message);
  log.info(style.muted(reloads ? "Reloads when you save · Ctrl+C to stop" : "Ctrl+C to stop"));
}
