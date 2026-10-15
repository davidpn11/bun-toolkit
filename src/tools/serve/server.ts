import { statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { BtkContext } from "../../context.ts";
import { BtkError } from "../../errors.ts";
import { displayPath } from "../../shared/fs.ts";
import { htmlResponse, isIgnoredPath, isLoopback, serveUntilStopped } from "../../shared/serve.ts";
import { networkUrls } from "./network.ts";
import { injectReload, listingPage, notFoundPage } from "./pages.ts";
import { isHtml, resolveRequest } from "./resolve.ts";

export type ServeSettings = { port: number; host: string; open: boolean; spa: boolean; cors: boolean };
export type ServeResult = { root: string; url: string; host: string; port: number; network: string[] };

export async function servePath(
  path: string,
  settings: ServeSettings,
  ctx: BtkContext,
): Promise<ServeResult> {
  const { root, page } = serveEntry(path, ctx.cwd);
  const shown = displayPath(root, ctx.cwd);
  let network: string[] = [];
  const server = await serveUntilStopped(
    {
      root,
      hostname: settings.host,
      port: settings.port,
      watch: { dir: root, recursive: true, accept: (changed) => !isIgnoredPath(changed) },
      page: (pathname) => respond(root, pathname, settings.spa),
      headers: responseHeaders(settings.cors),
    },
    settings.open,
    ctx,
    (started, link) => {
      network = networkUrls(settings.host, started.port);
      announce(shown, link, settings.host, network, ctx);
    },
    page,
  );
  const url = new URL(page, server.url).href;
  return { root: shown, url, host: settings.host, port: server.port, network };
}

function serveEntry(path: string, cwd: string): { root: string; page: string } {
  const absolute = resolve(cwd, path);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat) throw new BtkError(`Not found: ${path}`, { code: "ENOENT" });
  if (stat.isDirectory()) return { root: absolute, page: "" };
  return { root: dirname(absolute), page: encodeURIComponent(basename(absolute)) };
}

export async function respond(root: string, pathname: string, spa: boolean): Promise<Response> {
  const target = resolveRequest(root, pathname, spa);
  switch (target.kind) {
    case "redirect":
      return new Response(null, { status: 302, headers: { Location: target.location } });
    case "listing":
      return htmlResponse(injectReload(listingPage(target.path, pathname)));
    case "missing":
      return htmlResponse(injectReload(notFoundPage(pathname)), 404);
    case "file":
      return isHtml(target.path)
        ? htmlResponse(injectReload(await Bun.file(target.path).text()))
        : new Response(Bun.file(target.path));
  }
}

/** `no-cache` makes the browser revalidate, so a reload always shows the saved file. */
function responseHeaders(cors: boolean): Record<string, string> {
  return { "Cache-Control": "no-cache", ...(cors && { "Access-Control-Allow-Origin": "*" }) };
}

function announce(shown: string, link: string, host: string, network: string[], ctx: BtkContext): void {
  const { log, style } = ctx.reporter;
  log.info(`Serving ${shown} at ${link}`);
  if (!isLoopback(host)) {
    log.warn(`Anyone on your network can open the files in ${shown}`);
    for (const url of network) log.info(`  ${style.accent(url)}`);
  }
  log.info(style.muted("Reloads when files change · Ctrl+C to stop"));
}
