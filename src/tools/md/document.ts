import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { BtkContext } from "../../context.ts";
import { BtkError, UsageError } from "../../errors.ts";
import { hasPipedStdin, readStdin, STDIN } from "../../shared/stdio.ts";

export type MdDocument = {
  /** Absolute path, or undefined for standard input. */
  path: string | undefined;
  name: string;
  source: string;
};

export async function readDocument(file: string | undefined, ctx: BtkContext): Promise<MdDocument> {
  if (file === STDIN || (file === undefined && hasPipedStdin(ctx.io))) {
    const source = new TextDecoder().decode(await readStdin(ctx.io));
    return { path: undefined, name: STDIN, source };
  }
  if (file === undefined) {
    throw new UsageError("No markdown file given", {
      code: "ERR_NO_INPUT",
      hint: "Pass a file, or pipe markdown in: cat README.md | btk md preview",
    });
  }
  const path = resolve(ctx.cwd, file);
  if (isFolder(file, ctx)) {
    throw new UsageError(`${file} is a folder`, {
      code: "ERR_NOT_A_FILE",
      hint: `Pass a markdown file, or serve the folder with btk md serve ${file}`,
    });
  }
  return { path, name: basename(path), source: await readText(path, file) };
}

export function isFolder(path: string, ctx: BtkContext): boolean {
  return statSync(resolve(ctx.cwd, path), { throwIfNoEntry: false })?.isDirectory() === true;
}

export async function readText(path: string, shown: string): Promise<string> {
  const handle = Bun.file(path);
  if (!(await handle.exists())) throw new BtkError(`File not found: ${shown}`, { code: "ENOENT" });
  return handle.text();
}
