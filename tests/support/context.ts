import type { Registry, ToolDef } from "../../src/cli/define.ts";
import { defaultRegistry } from "../../src/cli/main.ts";
import { loadConfig } from "../../src/config/loader.ts";
import type { BtkContext } from "../../src/context.ts";
import { detectEnvironment } from "../../src/env.ts";
import { createReporter } from "../../src/output/reporter.ts";
import { createPrompter } from "../../src/prompt/prompter.ts";
import { VERSION } from "../../src/version.ts";
import { createIO } from "./streams.ts";
import { emptyDir } from "./tmp.ts";

/** A BtkContext with default config and captured streams, for TUI and unit tests. */
export async function createTestContext(
  options: { registry?: Registry; cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<BtkContext> {
  const registry = options.registry ?? defaultRegistry();
  const env = options.env ?? { BTK_CONFIG_DIR: "/nonexistent-btk-test-dir" };
  const cwd = options.cwd ?? emptyDir();
  const io = createIO({ tty: true });
  const tools = registry.entries.filter((e): e is ToolDef => e.kind === "tool");
  const configInfo = await loadConfig({ cwd, env, tools });
  const environment = detectEnvironment({
    argv: [],
    env: {},
    stdinIsTTY: true,
    stdoutIsTTY: true,
    stderrIsTTY: true,
  });
  return {
    cwd,
    platform: process.platform,
    arch: process.arch,
    version: VERSION,
    bunVersion: Bun.version,
    env,
    environment,
    outputMode: environment.mode,
    isInteractive: true,
    config: configInfo.config,
    configInfo,
    reporter: createReporter({ mode: "human", stdout: io.stdout, stderr: io.stderr }),
    prompter: createPrompter(false),
    registry,
    io,
    signal: new AbortController().signal,
  };
}
