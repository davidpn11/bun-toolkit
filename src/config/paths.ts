import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const CONFIG_FILENAMES = ["btk.config.ts", "btk.config.js", "btk.config.mjs"] as const;
export const GLOBAL_CONFIG_FILENAMES = ["config.ts", "config.js", "config.mjs"] as const;

/** `~/.bun-toolkit`, or `$BTK_CONFIG_DIR` (tests point this at a temp dir). */
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

/**
 * Walks up from `cwd` and returns the first `btk.config.{ts,js,mjs}` found, so commands work
 * from any subdirectory of a project. Never returns the global config.
 */
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
