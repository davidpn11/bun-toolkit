import { join, relative, sep } from "node:path";

// Next and the content macro both run from website/, while bundling moves this module.
const docsDir = join(process.cwd(), "..", "docs");

export function docFileOf(absolutePath: string): string {
  return relative(docsDir, absolutePath).split(sep).join("/");
}
