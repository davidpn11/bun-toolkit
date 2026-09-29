import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isImagePath } from "./formats.ts";

export type ImageFile = {
  path: string;
  /** Directory the file was found under; `--out-dir` mirrors the structure below it. */
  base: string;
};

export type Collected = {
  files: ImageFile[];
  missing: string[];
  /** Explicit files that are not images. */
  ignored: string[];
};

export type CollectOptions = {
  cwd: string;
  recursive: boolean;
  /** Folders to leave out, e.g. `--out-dir` so a second run does not re-read its own outputs. */
  exclude?: string[];
};

const SKIPPED_DIRS = new Set(["node_modules"]);
const GLOB_CHARS = /[*?[\]{}]/;

export async function collectImages(paths: readonly string[], options: CollectOptions): Promise<Collected> {
  const found = new Map<string, ImageFile>();
  const collected: Collected = { files: [], missing: [], ignored: [] };
  const excluded = (options.exclude ?? []).map((dir) => resolve(options.cwd, dir));

  for (const arg of paths) {
    const matches = await collectArg(arg, options, collected);
    for (const file of matches) {
      if (!found.has(file.path) && !isInside(file.path, excluded)) found.set(file.path, file);
    }
  }

  collected.files = [...found.values()].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true }),
  );
  return collected;
}

async function collectArg(arg: string, options: CollectOptions, collected: Collected): Promise<ImageFile[]> {
  const absolute = resolve(options.cwd, arg);
  if (!existsSync(absolute)) {
    const matches = GLOB_CHARS.test(arg) ? await expandGlob(arg, options.cwd) : [];
    if (matches.length === 0) collected.missing.push(arg);
    return matches.map((path) => ({ path, base: options.cwd }));
  }
  if (statSync(absolute).isDirectory()) {
    return walkDirectory(absolute, options.recursive).map((path) => ({ path, base: absolute }));
  }
  if (isImagePath(absolute)) return [{ path: absolute, base: dirname(absolute) }];
  collected.ignored.push(arg);
  return [];
}

function isInside(path: string, dirs: string[]): boolean {
  return dirs.some((dir) => path.startsWith(dir + sep));
}

async function expandGlob(pattern: string, cwd: string): Promise<string[]> {
  const matches: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({ cwd, absolute: true, onlyFiles: true })) {
    if (isImagePath(path)) matches.push(path);
  }
  return matches;
}

/** Skips hidden folders, and `node_modules` when recursing. */
function walkDirectory(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !SKIPPED_DIRS.has(entry.name)) files.push(...walkDirectory(path, true));
    } else if (isImagePath(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
