import { join } from "node:path";
import { type RunOptions, run } from "../../src/cli/main.ts";
import { createIO } from "./streams.ts";
import { emptyDir } from "./tmp.ts";

const ROOT = join(import.meta.dir, "..", "..");
const ENTRY = join(ROOT, "bin", "btk.ts");

export type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** The command used to spawn btk: the compiled binary when BTK_BIN is set (dist tests), else the source. */
export function btkCommand(): string[] {
  return process.env.BTK_BIN ? [process.env.BTK_BIN] : [process.execPath, ENTRY];
}

/** Spawns btk as a real subprocess (no TTY). */
export async function spawnBtk(
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; stdin?: string } = {},
): Promise<CliResult> {
  const proc = Bun.spawn([...btkCommand(), ...args], {
    cwd: options.cwd ?? emptyDir(),
    env: options.env ?? { PATH: process.env.PATH, HOME: process.env.HOME },
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/** Runs btk in-process with captured streams. Much faster than spawning; used for most CLI tests. */
export async function runBtk(
  args: string[],
  options: Omit<RunOptions, "io"> & { tty?: boolean; stdin?: string } = {},
): Promise<CliResult> {
  const io = createIO({ tty: options.tty, stdin: options.stdin });
  const code = await run(args, {
    cwd: emptyDir(),
    ...options,
    env: options.env ?? { HOME: process.env.HOME, BTK_CONFIG_DIR: "/nonexistent-btk-test-dir" },
    io,
  });
  return { code, stdout: io.stdout.text, stderr: io.stderr.text };
}
