import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

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

/** Directory listing for pickers: directories first, then files, each sorted by name. Never throws on unreadable entries. */
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
