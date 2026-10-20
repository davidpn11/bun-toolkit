import type { Registry, ToolDef } from "../../src/cli/define.ts";
import { defaultRegistry } from "../../src/cli/main.ts";
import { loadConfig } from "../../src/config/loader.ts";
import type { BtkContext } from "../../src/context.ts";
import { detectEnvironment } from "../../src/env.ts";
import { createReporter } from "../../src/output/reporter.ts";
import { createHooks } from "../../src/plugins/loader.ts";
import { createPrompter } from "../../src/prompt/prompter.ts";
import { VERSION } from "../../src/version.ts";
import { createIO } from "./streams.ts";
import { emptyDir } from "./tmp.ts";

export async function createTestContext(
  options: { registry?: Registry; cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<BtkContext> {
  const registry = options.registry ?? defaultRegistry();
  const env = options.env ?? { BTK_CONFIG_DIR: "/nonexistent-btk-test-dir" };
  const cwd = options.cwd ?? emptyDir();
  const io = createIO({ tty: true });
  const tools = registry.entries.filter((e): e is ToolDef => e.kind === "tool");
  const configInfo = await loadConfig({ cwd, env, tools, project: options.cwd !== undefined });
  const environment = detectEnvironment({
    argv: [],
    env: {},
    stdinIsTTY: true,
    stdoutIsTTY: true,
    stderrIsTTY: true,
  });
  const reporter = createReporter({ mode: "human", stdout: io.stdout, stderr: io.stderr });
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
    hooks: createHooks(configInfo.config.plugins, reporter.log),
    reporter,
    prompter: createPrompter({ interactive: false, canAskSecret: false }),
    registry,
    io,
    signal: new AbortController().signal,
  };
}
