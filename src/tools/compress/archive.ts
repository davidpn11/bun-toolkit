import { readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

/** Reads each file's bytes first: Bun.Archive writes empty entries for Bun.file() values. */
export async function tarFolder(folder: string): Promise<{ tar: Uint8Array; files: number }> {
  const entries: Record<string, Uint8Array> = {};
  const root = basename(folder);
  for (const path of listFiles(folder)) {
    entries[join(root, relative(folder, path))] = await Bun.file(path).bytes();
  }
  const tar = await new Bun.Archive(entries).bytes();
  return { tar, files: Object.keys(entries).length };
}

/** Extracts into `dest`. Bun refuses entries that would land outside it (`../`). File modes become 644. */
export function extractTar(tar: Uint8Array, dest: string): Promise<number> {
  return new Bun.Archive(tar).extract(dest);
}

export type TarLayout = { files: number; root?: string };

export async function tarLayout(tar: Uint8Array): Promise<TarLayout> {
  const paths = [...(await new Bun.Archive(tar).files()).keys()];
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  const [only] = roots;
  const nested = roots.size === 1 && only !== undefined && paths.every((path) => path.startsWith(`${only}/`));
  return { files: paths.length, ...(nested && { root: only }) };
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
