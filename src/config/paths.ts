import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const EXTENSIONS = ["ts", "js", "mjs", "json"] as const;

export const CONFIG_FORMATS = ["ts", "json"] as const;
export type ConfigFormat = (typeof CONFIG_FORMATS)[number];

export const CONFIG_FILENAMES = ["btk", "bun-toolkit"].flatMap((base) =>
  EXTENSIONS.map((ext) => `${base}.config.${ext}`),
);
export const GLOBAL_CONFIG_FILENAMES = EXTENSIONS.map((ext) => `config.${ext}`);

export function isJsonConfig(path: string): boolean {
  return path.endsWith(".json");
}

export function globalConfigDir(env: Record<string, string | undefined> = process.env): string {
  return env.BTK_CONFIG_DIR ? resolve(env.BTK_CONFIG_DIR) : join(homedir(), ".bun-toolkit");
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

export function findGlobalConfig(env: Record<string, string | undefined> = process.env): string | undefined {
  const dir = globalConfigDir(env);
  return GLOBAL_CONFIG_FILENAMES.map((name) => join(dir, name)).find(isFile);
}

export function findProjectConfig(cwd: string, env: Record<string, string | undefined> = process.env) {
  const globalDir = globalConfigDir(env);
  let dir = resolve(cwd);
  while (true) {
    if (dir !== globalDir) {
      const match = CONFIG_FILENAMES.map((name) => join(dir, name)).find(isFile);
      if (match) return match;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
