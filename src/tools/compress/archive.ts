import { lstatSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, posix, relative } from "node:path";
import { CodecError } from "./codec.ts";

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

/** File modes become 644. */
export async function extractTar(tar: Uint8Array, dest: string): Promise<number> {
  const files = await new Bun.Archive(tar).files();
  for (const [name, file] of files) {
    const entry = entryPath(name);
    refuseLinks(dest, entry);
    const path = join(dest, entry);
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, await file.bytes());
  }
  return files.size;
}

export type TarLayout = { files: number; root?: string };

export async function tarLayout(tar: Uint8Array): Promise<TarLayout> {
  const paths = [...(await new Bun.Archive(tar).files()).keys()].map(entryPath);
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  const [only] = roots;
  const nested = roots.size === 1 && only !== undefined && paths.every((path) => path.startsWith(`${only}/`));
  return { files: paths.length, ...(nested && { root: only }) };
}

function entryPath(name: string): string {
  const path = posix.normalize(name);
  if (posix.isAbsolute(path) || path === ".." || path.startsWith("../"))
    throw new CodecError(
      `The archive has an entry outside its folder: ${name}`,
      "Don't extract archives you don't trust",
    );
  return path;
}

function refuseLinks(dest: string, entry: string): void {
  const parts = entry.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const path = join(dest, ...parts.slice(0, i));
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new CodecError(`Refusing to extract through the symlink ${path}`, "Extract into an empty folder");
  }
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
