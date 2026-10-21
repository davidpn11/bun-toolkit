import { existsSync } from "node:fs";
import { basename, join, posix, relative, resolve, sep } from "node:path";
import type { BtkContext } from "../../context.ts";
import { UsageError } from "../../errors.ts";
import { collectFiles } from "../../shared/collect.ts";
import { displayPath, requireFolder } from "../../shared/fs.ts";
import { pathInside } from "../../shared/serve.ts";
import { readText } from "./document.ts";
import { buildPage, type PageOptions, wrapBody } from "./html/page.ts";
import { pageCss } from "./preview.ts";
import { folderBody, INDEX_NAMES, MARKDOWN, pageHref, renderNav, type SitePage, sitePages } from "./site.ts";
import type { ResolvedTheme } from "./theme/types.ts";

export type BuildSettings = { out: string; css?: string | undefined; overwrite: boolean; dryRun: boolean };

export type BuildResult = {
  mode: "build";
  root: string;
  out: string;
  pages: number;
  folders: number;
  assets: number;
  dryRun: boolean;
};

type Site = { root: string; pages: SitePage[]; outputs: Map<string, string> };
type Written = { path: string; html: string };

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

export async function buildSite(
  dir: string,
  theme: ResolvedTheme,
  settings: BuildSettings,
  ctx: BtkContext,
): Promise<BuildResult> {
  const root = requireFolder(dir, ctx.cwd, `To render one file, run btk md html ${dir}`);
  const out = resolve(ctx.cwd, settings.out);
  refuseExisting(out, settings);
  const pages = await sitePages(root, displayPath(root, ctx.cwd));
  const site: Site = { root, pages, outputs: outputPaths(pages) };
  const css = await pageCss(theme, settings.css, ctx);
  const written = [
    ...(await Promise.all(pages.map((page) => pageHtml(site, page, css, ctx)))),
    ...folderPages(site, css, ctx),
  ];
  const assets = await assetPaths(root, out);
  if (!settings.dryRun) await writeSite(root, out, written, assets);
  return {
    mode: "build",
    root: displayPath(root, ctx.cwd),
    out: displayPath(out, ctx.cwd),
    pages: pages.length,
    folders: written.length - pages.length,
    assets: assets.length,
    dryRun: settings.dryRun,
  };
}

function refuseExisting(out: string, settings: BuildSettings): void {
  if (!existsSync(out) || settings.overwrite) return;
  throw new UsageError(`${settings.out} already exists`, {
    code: "ERR_OUTPUT_EXISTS",
    hint: "Pass --overwrite to write into it",
  });
}

function outputPaths(pages: readonly SitePage[]): Map<string, string> {
  const paths = new Set(pages.map((page) => page.path));
  const outputs = new Map<string, string>();
  for (const { path } of pages) {
    const dir = posix.dirname(path);
    const index = INDEX_NAMES.map((name) => posix.join(dir, name)).find((p) => paths.has(p));
    outputs.set(path, path === index ? posix.join(dir, "index.html") : path.replace(MARKDOWN, ".html"));
  }
  return outputs;
}

async function pageHtml(site: Site, page: SitePage, css: string, ctx: BtkContext): Promise<Written> {
  const source = await readText(join(site.root, page.path), page.path);
  const options = pageOptions(site, css, page.path, page.path);
  const path = site.outputs.get(page.path) as string;
  return { path, html: relativeLinks(buildPage(source, options, ctx.hooks), page.path, path, site) };
}

function folderPages(site: Site, css: string, ctx: BtkContext): Written[] {
  const outputs = new Set(site.outputs.values());
  return foldersOf(site.pages)
    .filter((dir) => !outputs.has(posix.join(dir, "index.html")))
    .map((dir) => {
      const title = dir || basename(site.root);
      const path = posix.join(dir, "index.html");
      const html = wrapBody(folderBody(dir, site.pages, title), pageOptions(site, css, title), ctx.hooks);
      return { path, html: relativeLinks(html, path, path, site) };
    });
}

function foldersOf(pages: readonly SitePage[]): string[] {
  const dirs = new Set([""]);
  for (const { path } of pages) {
    const parts = path.split("/").slice(0, -1);
    parts.forEach((_, i) => dirs.add(parts.slice(0, i + 1).join("/")));
  }
  return [...dirs];
}

function pageOptions(site: Site, css: string, title: string, current?: string): PageOptions {
  return { css, fallbackTitle: title, liveReload: "", nav: renderNav(site.pages, current) };
}

/** Relative links, so the site works from any sub-path and from file://. */
function relativeLinks(html: string, source: string, output: string, site: Site): string {
  const rewrite = (attribute: string) => ({
    element(element: HTMLRewriterTypes.Element) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, builtHref(value, source, output, site));
    },
  });
  return new HTMLRewriter().on("a[href]", rewrite("href")).on("img[src]", rewrite("src")).transform(html);
}

function builtHref(href: string, source: string, output: string, site: Site): string {
  if (SCHEME.test(href) || href.startsWith("//") || href.startsWith("#")) return href;
  const [, path = "", rest = ""] = /^([^?#]*)(.*)$/.exec(href) ?? [];
  const target = targetOf(path, source);
  if (target === undefined) return href;
  const built = target === "" || target.endsWith("/") ? `${target}index.html` : target;
  const file = site.outputs.get(built) ?? (MARKDOWN.test(built) ? built.replace(MARKDOWN, ".html") : built);
  const link = posix.relative(posix.dirname(output), file) || posix.basename(file);
  return link.split("/").map(encodeURIComponent).join("/") + rest;
}

function targetOf(path: string, source: string): string | undefined {
  if (path === "") return undefined;
  try {
    const decoded = decodeURIComponent(path);
    const target = decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(source), decoded);
    return decoded.endsWith("/") && !target.endsWith("/") ? `${target}/` : target;
  } catch {
    return undefined;
  }
}

async function assetPaths(root: string, out: string): Promise<string[]> {
  const { files } = await collectFiles([root], {
    cwd: root,
    recursive: true,
    exclude: [out],
    accept: (path) => !MARKDOWN.test(path),
  });
  return files
    .map((file) => relative(root, file.path).split(sep).join("/"))
    .filter((path) => pathInside(root, pageHref(path)));
}

async function writeSite(root: string, out: string, pages: Written[], assets: string[]): Promise<void> {
  await Promise.all([
    ...pages.map((page) => Bun.write(join(out, page.path), page.html)),
    ...assets.map((path) => Bun.write(join(out, path), Bun.file(join(root, path)))),
  ]);
}
