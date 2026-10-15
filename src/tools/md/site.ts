import { statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { collectFiles } from "../../shared/collect.ts";
import { pathInside } from "../../shared/serve.ts";
import { splitFrontMatter } from "./front-matter.ts";

export type SitePage = {
  /** Relative to the site root, with `/` on every OS. */
  path: string;
  title: string;
};

export type SiteTarget =
  | { kind: "page"; file: string; path: string }
  | { kind: "folder"; dir: string }
  | { kind: "redirect"; location: string };

const MARKDOWN = /\.(md|markdown)$/i;
const INDEX_NAMES = ["README.md", "readme.md", "index.md"];
const HEADING = /^#[ \t]+(.+?)[ \t#]*$/m;

/** Every markdown file under `root`, skipping `node_modules` and dot folders such as `.git`. */
export async function listPages(root: string): Promise<SitePage[]> {
  const { files } = await collectFiles([root], {
    cwd: root,
    recursive: true,
    accept: (p) => MARKDOWN.test(p),
  });
  const paths = files.map((file) => toPosix(relative(root, file.path))).filter(isVisible);
  const pages = await Promise.all(
    paths.map(async (path) => ({ path, title: titleOf(await Bun.file(join(root, path)).text(), path) })),
  );
  return pages.sort(comparePages);
}

export function resolveTarget(root: string, pathname: string): SiteTarget | undefined {
  const path = pathInside(root, pathname);
  const stat = path ? statSync(path, { throwIfNoEntry: false }) : undefined;
  if (!path || !stat) return undefined;
  if (stat.isFile()) return MARKDOWN.test(path) ? pageTarget(root, path) : undefined;
  if (!stat.isDirectory()) return undefined;
  if (!pathname.endsWith("/")) return { kind: "redirect", location: `${pathname}/` };
  const index = INDEX_NAMES.map((name) => join(path, name)).find((file) =>
    statSync(file, { throwIfNoEntry: false }),
  );
  return index ? pageTarget(root, index) : { kind: "folder", dir: toPosix(relative(root, path)) };
}

export function titleOf(source: string, path: string): string {
  const { body, title } = splitFrontMatter(source);
  if (title) return title;
  const heading = body.match(HEADING)?.[1];
  const text = heading
    ?.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return text || basename(path, extname(path));
}

export function pageHref(path: string): string {
  return `/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function renderNav(pages: readonly SitePage[], current: string | undefined): string {
  const groups = groupByFolder(pages);
  const items = [...groups].map(([dir, group]) => {
    const links = group.map((page) => navLink(page, current)).join("");
    return dir
      ? `<li><span class="btk-nav-folder">${Bun.escapeHTML(dir)}</span><ul>${links}</ul></li>`
      : links;
  });
  return `<ul>${items.join("")}</ul>`;
}

export function folderBody(dir: string, pages: readonly SitePage[], heading = dir): string {
  const inside = pages.filter((page) => !dir || page.path.startsWith(`${dir}/`));
  const items = inside.map(
    (page) =>
      `<li><a href="${pageHref(page.path)}">${Bun.escapeHTML(page.title)}</a> <code>${Bun.escapeHTML(page.path)}</code></li>`,
  );
  const title = `<h1>${Bun.escapeHTML(heading)}</h1>\n`;
  return items.length > 0
    ? `${title}<ul>\n${items.join("\n")}\n</ul>\n`
    : `${title}<p>No markdown files here.</p>\n`;
}

function pageTarget(root: string, file: string): SiteTarget {
  return { kind: "page", file, path: toPosix(relative(root, file)) };
}

function navLink(page: SitePage, current: string | undefined): string {
  const active = page.path === current ? ' aria-current="page"' : "";
  return `<li><a href="${pageHref(page.path)}"${active}>${Bun.escapeHTML(page.title)}</a></li>`;
}

function groupByFolder(pages: readonly SitePage[]): Map<string, SitePage[]> {
  const groups = new Map<string, SitePage[]>();
  for (const page of pages) {
    const dir = folderOf(page.path);
    groups.set(dir, [...(groups.get(dir) ?? []), page]);
  }
  return groups;
}

function comparePages(a: SitePage, b: SitePage): number {
  const [dirA, dirB] = [folderOf(a.path), folderOf(b.path)];
  if (dirA !== dirB) return dirA === "" ? -1 : dirB === "" ? 1 : dirA.localeCompare(dirB);
  const [indexA, indexB] = [isIndex(a.path), isIndex(b.path)];
  if (indexA !== indexB) return indexA ? -1 : 1;
  return a.path.localeCompare(b.path, undefined, { numeric: true });
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function isIndex(path: string): boolean {
  return INDEX_NAMES.includes(basename(path));
}

function isVisible(path: string): boolean {
  return !path.split("/").some((segment) => segment.startsWith("."));
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
