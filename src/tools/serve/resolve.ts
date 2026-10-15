import { statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathInside } from "../../shared/serve.ts";

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
  if (path && stat?.isDirectory()) return folderTarget(path, pathname);
  return spa && path && !extname(pathname) ? spaTarget(root) : { kind: "missing" };
}

export function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}

function folderTarget(path: string, pathname: string): ServeTarget {
  if (!pathname.endsWith("/")) return { kind: "redirect", location: `${pathname}/` };
  const index = join(path, INDEX);
  return statSync(index, { throwIfNoEntry: false })?.isFile()
    ? { kind: "file", path: index }
    : { kind: "listing", path };
}

function spaTarget(root: string): ServeTarget {
  const index = join(root, INDEX);
  return statSync(index, { throwIfNoEntry: false })?.isFile()
    ? { kind: "file", path: index }
    : { kind: "missing" };
}
