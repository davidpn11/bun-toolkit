import { basename, resolve } from "node:path";
import type { BtkContext } from "../../context.ts";
import { pluralize } from "../../output/format.ts";
import { displayPath } from "../../shared/fs.ts";
import { htmlResponse, isIgnoredPath, serveUntilStopped, type WatchTarget } from "../../shared/serve.ts";
import { readText } from "./document.ts";
import { buildPage, LIVE_RELOAD, type PageOptions, wrapBody } from "./html/page.ts";
import { announce, type BrowserSettings, pageCss } from "./preview.ts";
import { folderBody, listPages, renderNav, resolveTarget, sitePages } from "./site.ts";
import type { ResolvedTheme } from "./theme/types.ts";

export type SitePreview = { mode: "site"; root: string; pages: number; theme: string; url: string };

const SITE_FILE = /\.(md|markdown|css)$/i;

export async function sitePreview(
  dir: string,
  theme: ResolvedTheme,
  settings: BrowserSettings,
  ctx: BtkContext,
): Promise<SitePreview> {
  const root = resolve(ctx.cwd, dir);
  const shown = displayPath(root, ctx.cwd);
  const count = (await sitePages(root, shown)).length;
  const page = (pathname: string) => sitePage(root, pathname, theme, settings, ctx);
  const watch: WatchTarget = { dir: root, recursive: true, accept: isSiteFile };
  const { url } = await serveUntilStopped(
    { root, watch, port: settings.port, page },
    settings.open,
    ctx,
    (_, link) => announce(`Serving ${pluralize(count, "page")} from ${shown} at ${link}`, true, ctx),
  );
  return { mode: "site", root: shown, pages: count, theme: theme.name, url };
}

async function sitePage(
  root: string,
  pathname: string,
  theme: ResolvedTheme,
  settings: BrowserSettings,
  ctx: BtkContext,
): Promise<Response | undefined> {
  const target = resolveTarget(root, pathname);
  if (!target) return undefined;
  if (target.kind === "redirect")
    return new Response(null, { status: 302, headers: { Location: target.location } });
  const pages = await listPages(root);
  const current = target.kind === "page" ? target.path : undefined;
  const options: PageOptions = {
    css: await pageCss(theme, settings.css, ctx),
    fallbackTitle: target.kind === "page" ? target.path : folderTitle(root, target.dir),
    liveReload: LIVE_RELOAD,
    nav: renderNav(pages, current),
  };
  if (target.kind === "folder") {
    const body = folderBody(target.dir, pages, folderTitle(root, target.dir));
    return htmlResponse(wrapBody(body, options, ctx.hooks));
  }
  return htmlResponse(buildPage(await readText(target.file, target.path), options, ctx.hooks));
}

function folderTitle(root: string, dir: string): string {
  return dir || basename(root);
}

function isSiteFile(changed: string): boolean {
  return SITE_FILE.test(changed) && !isIgnoredPath(changed);
}
