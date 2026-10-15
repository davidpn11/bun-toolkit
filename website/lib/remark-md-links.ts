import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Link, Nodes, Root } from "mdast";
import { docFileOf } from "./docs-dir";
import { findPage, githubUrlOf, urlOf } from "./pages";

type SourceFile = { path: string; fail(message: string, place: Link): never };

const relativeMarkdownLink = /^(?!\w+:|\/|#)([^#?]+\.md)(#.*)?$/;

function* links(node: Nodes): Generator<Link> {
  if (node.type === "link") yield node;
  if ("children" in node) for (const child of node.children) yield* links(child);
}

function siteUrl(target: string, hash: string): string {
  const docFile = docFileOf(target);
  const page = findPage(docFile);
  return (page ? urlOf(page.file) : githubUrlOf(docFile)) + hash;
}

function rewrite(link: Link, file: SourceFile) {
  const match = relativeMarkdownLink.exec(link.url);
  if (!match?.[1]) return;
  const target = resolve(dirname(file.path), match[1]);
  if (!existsSync(target)) file.fail(`Broken link to ${link.url}`, link);
  link.url = siteUrl(target, match[2] ?? "");
}

export function remarkMdLinks() {
  return (tree: Root, file: SourceFile) => {
    for (const link of links(tree)) rewrite(link, file);
  };
}
