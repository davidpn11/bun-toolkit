import { relative, sep } from "node:path";

/** `relative()` with `/` separators, so expected paths read the same on every OS. */
export function posixRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

/** How btk displays a path in the working directory: `./a.png`, or `.\a.png` on Windows. */
export function dotSlash(name: string): string {
  return `.${sep}${name}`;
}
