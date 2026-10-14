import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { BtkError, UsageError } from "../errors.ts";

export type DirEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Bytes; 0 for directories or unreadable files. */
  size: number;
};

export type ListOptions = {
  /** Lowercase extensions with the dot (`.png`). Directories are always listed. */
  extensions?: readonly string[];
  showHidden?: boolean;
};

export function listDirectory(dir: string, options: ListOptions = {}): DirEntry[] {
  const allowed = options.extensions ? new Set(options.extensions.map((e) => e.toLowerCase())) : undefined;
  const entries: DirEntry[] = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (!options.showHidden && dirent.name.startsWith(".")) continue;
    const path = join(dir, dirent.name);
    let isDirectory = dirent.isDirectory();
    let size = 0;
    if (dirent.isSymbolicLink() || dirent.isFile()) {
      try {
        const stat = statSync(path);
        isDirectory = stat.isDirectory();
        size = stat.isFile() ? stat.size : 0;
      } catch {
        continue;
      }
    }
    if (!isDirectory && allowed && !allowed.has(extname(dirent.name).toLowerCase())) continue;
    entries.push({ name: dirent.name, path, isDirectory, size });
  }
  const byName = (a: DirEntry, b: DirEntry) => a.name.localeCompare(b.name, undefined, { numeric: true });
  return [
    ...entries.filter((e) => e.isDirectory).sort(byName),
    ...entries.filter((e) => !e.isDirectory).sort(byName),
  ];
}

/** A path as messages show it: relative to `cwd` when it is inside, absolute otherwise. */
export function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  if (rel === "") return ".";
  return rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}

/** The absolute path of a folder argument; a missing path fails, and a file is a usage error with `hint`. */
export function requireFolder(path: string, cwd: string, hint: string): string {
  const absolute = resolve(cwd, path);
  const stat = statSync(absolute, { throwIfNoEntry: false });
  if (!stat) throw new BtkError(`Folder not found: ${path}`, { code: "ENOENT" });
  if (!stat.isDirectory()) throw new UsageError(`Not a folder: ${path}`, { code: "ERR_NOT_A_FOLDER", hint });
  return absolute;
}

export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.btk-${process.pid}.tmp`;
  try {
    await Bun.write(temp, data);
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

const FILE_ERRORS: Record<string, string> = {
  ENOENT: "File not found",
  EACCES: "Permission denied",
  EPERM: "Permission denied",
  EISDIR: "Is a directory",
};

export function describeFileError(error: unknown): { code: string; reason: string } {
  const code = (error as { code?: string } | null)?.code ?? "ERR_READ";
  const reason = FILE_ERRORS[code] ?? (error instanceof Error ? error.message : String(error));
  return { code, reason };
}
