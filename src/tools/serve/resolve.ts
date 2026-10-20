import { statSync } from "node:fs";
import { extname } from "node:path";
import { folderRedirect, pathInside } from "../../shared/serve.ts";

export type ServeTarget =
  | { kind: "file"; path: string }
  | { kind: "listing"; path: string }
  | { kind: "redirect"; location: string }
  | { kind: "missing" };

const INDEX = "index.html";

/** Folders without a trailing `/` redirect, so relative links inside them resolve. */
export function resolveRequest(root: string, pathname: string, spa: boolean): ServeTarget {
  const path = pathInside(root, pathname);
  const stat = path ? statSync(path, { throwIfNoEntry: false }) : undefined;
  if (path && stat?.isFile()) return { kind: "file", path };
  if (path && stat?.isDirectory()) return folderTarget(root, path, pathname);
  return spa && path && !extname(pathname) ? spaTarget(root) : { kind: "missing" };
}

export function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}

function folderTarget(root: string, path: string, pathname: string): ServeTarget {
  if (!pathname.endsWith("/")) return { kind: "redirect", location: folderRedirect(pathname) };
  const index = indexFile(root, `${pathname}${INDEX}`);
  return index ? { kind: "file", path: index } : { kind: "listing", path };
}

function spaTarget(root: string): ServeTarget {
  const index = indexFile(root, `/${INDEX}`);
  return index ? { kind: "file", path: index } : { kind: "missing" };
}

function indexFile(root: string, pathname: string): string | undefined {
  const index = pathInside(root, pathname);
  return index && statSync(index, { throwIfNoEntry: false })?.isFile() ? index : undefined;
}
