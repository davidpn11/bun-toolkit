import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type TempProject = {
  dir: string;
  /** Isolated global config dir; pass `env` so the real ~/.bun-toolkit is never read. */
  globalDir: string;
  env: Record<string, string | undefined>;
  write(relativePath: string, content: string): string;
  writeGlobal(content: string, name?: string): string;
  cleanup(): void;
};

let counter = 0;
let empty: string | undefined;

/** A shared empty directory, so tests never pick up a btk.config.ts from the repo or its parents. */
export function emptyDir(): string {
  empty ??= mkdtempSync(join(tmpdir(), `btk-empty-${process.pid}-`));
  return empty;
}

/**
 * A temp project with its own global config dir. Each call gets a fresh directory, so config
 * module caching in `import()` never leaks between tests.
 */
export function createTempProject(): TempProject {
  const root = mkdtempSync(join(tmpdir(), `btk-test-${process.pid}-${counter++}-`));
  const dir = join(root, "project");
  const globalDir = join(root, "global");
  mkdirSync(dir, { recursive: true });

  const write = (base: string, relativePath: string, content: string) => {
    const path = join(base, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  };

  return {
    dir,
    globalDir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      BTK_CONFIG_DIR: globalDir,
      BTK_NO_LOCAL_CONFIG: "off",
    },
    write: (relativePath, content) => write(dir, relativePath, content),
    writeGlobal: (content, name = "config.ts") => write(globalDir, name, content),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
