import { builtins } from "../commands/index.ts";
import { loadConfig } from "../config/loader.ts";
import type { BtkContext, BtkIO } from "../context.ts";
import { detectEnvironment, type Environment, type EnvironmentInput } from "../env.ts";
import { BtkError, ExitCode, isBtkError } from "../errors.ts";
import { createReporter, type Reporter } from "../output/reporter.ts";
import { createStyler } from "../output/style.ts";
import { createPrompter } from "../prompt/prompter.ts";
import { tools } from "../tools/index.ts";
import { launchTui } from "../tui/launch.ts";
import { VERSION } from "../version.ts";
import { parseArgs } from "./args.ts";
import { type ArgsSpec, createRegistry, type Registry, type ToolDef } from "./define.ts";
import { globalFlags, uiFlag } from "./global-args.ts";
import { renderActionHelp, renderRootHelp, renderToolHelp } from "./help.ts";
import { hasToken, peekValue, resolveRoute } from "./router.ts";

export type RunOptions = {
  io?: Partial<BtkIO>;
  env?: Record<string, string | undefined>;
  cwd?: string;
  /** Override the command registry (tests register a fake tool). */
  registry?: Registry;
  signal?: AbortSignal;
};

export const defaultRegistry = (): Registry => createRegistry(builtins, tools);

/**
 * Runs one CLI invocation and resolves to the exit code. This is the only error boundary:
 * nothing below it calls `process.exit`.
 */
export async function run(argv: readonly string[], options: RunOptions = {}): Promise<number> {
  const io: BtkIO = {
    stdin: options.io?.stdin ?? process.stdin,
    stdout: options.io?.stdout ?? process.stdout,
    stderr: options.io?.stderr ?? process.stderr,
  };
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const signal = options.signal ?? new AbortController().signal;

  const envInput: EnvironmentInput = {
    argv,
    env,
    stdinIsTTY: io.stdin.isTTY === true,
    stdoutIsTTY: io.stdout.isTTY === true,
    stderrIsTTY: io.stderr.isTTY === true,
  };
  let environment: Environment = detectEnvironment(envInput);
  let reporter: Reporter = createReporter({
    mode: environment.mode,
    stdout: io.stdout,
    stderr: io.stderr,
    color: environment.color,
    verbose: environment.verbose,
  });

  try {
    const registry = options.registry ?? defaultRegistry();
    const route = resolveRoute(argv, registry);

    if (route.kind === "version") {
      if (environment.mode === "json")
        reporter.json({ ok: true, command: "version", data: { version: VERSION } });
      else io.stdout.write(`${VERSION}\n`);
      return ExitCode.Ok;
    }
    if (route.kind === "root-help") {
      io.stdout.write(`${renderRootHelp(createStyler(stdoutColor(environment, io)), registry)}\n`);
      return ExitCode.Ok;
    }

    const toolDefs = registry.entries.filter((e): e is ToolDef => e.kind === "tool");
    const configInfo = await loadConfig({
      cwd,
      env,
      tools: toolDefs,
      explicitPath: peekValue(argv, "--config"),
    });

    environment = detectEnvironment(envInput, configInfo.config.output);
    reporter = createReporter({
      mode: environment.mode,
      stdout: io.stdout,
      stderr: io.stderr,
      color: environment.color,
      verbose: environment.verbose,
    });

    const ctx: BtkContext = {
      cwd,
      platform: process.platform,
      arch: process.arch,
      version: VERSION,
      bunVersion: Bun.version,
      env,
      environment,
      outputMode: environment.mode,
      isInteractive: environment.interactive,
      config: configInfo.config,
      configInfo,
      reporter,
      prompter: createPrompter({
        interactive: environment.interactive,
        canAskSecret: io.stdin.isTTY === true && io.stderr.isTTY === true && environment.mode !== "json",
      }),
      registry,
      io,
      signal,
    };
    const style = createStyler(stdoutColor(environment, io));

    if (route.kind === "tool-help") {
      io.stdout.write(`${renderToolHelp(style, route.tool)}\n`);
      return ExitCode.Ok;
    }
    if (route.kind === "tool-ui") {
      if (configInfo.error) throw configInfo.error;
      parseArgs(route.tokens, { ...globalFlags, ...uiFlag }, { commandPath: route.tool.name });
      await launchTui(ctx, route.tool);
      return ExitCode.Ok;
    }

    const { action, tool } = route;
    const toolConfig = tool ? configInfo.config.tools[tool.name] : undefined;

    if (hasToken(route.tokens, "--help", "-h")) {
      io.stdout.write(
        `${renderActionHelp(style, route.path, action, {
          toolConfig,
          toolName: tool?.name,
          sources: configInfo.sources,
          hasUi: Boolean(tool?.ui),
        })}\n`,
      );
      return ExitCode.Ok;
    }

    if (action.requiresConfig !== false && configInfo.error) throw configInfo.error;

    // `btk <tool> <action> --ui` opens the dashboard; the action's own arguments are not required.
    if (tool?.ui && hasToken(route.tokens, "--ui")) {
      await launchTui(ctx, tool);
      return ExitCode.Ok;
    }

    const actionArgs: ArgsSpec = action.args ?? {};
    const spec: ArgsSpec = { ...actionArgs, ...globalFlags, ...(tool?.ui ? uiFlag : {}) };
    const parsed = parseArgs(route.tokens, spec, {
      commandPath: route.path,
      toolName: tool?.name,
      toolConfig,
    });

    const input = Object.fromEntries(Object.keys(actionArgs).map((key) => [key, parsed.values[key]]));
    reporter.log.debug(`${route.path} ${JSON.stringify(input)}`);

    const result = await action.run(input, ctx, { sources: parsed.sources });
    const exitCode = action.exitCode?.(result, ctx) ?? ExitCode.Ok;

    if (environment.mode === "json") {
      reporter.json({ ok: exitCode === ExitCode.Ok, command: route.path, data: result ?? null });
    } else {
      action.render?.(result, reporter.out, ctx);
    }
    return exitCode;
  } catch (error) {
    reporter.spinner.stop();
    reporter.progress.stop();
    const final =
      signal.aborted && !isBtkError(error)
        ? new BtkError("Cancelled", { code: "ERR_CANCELLED", exitCode: ExitCode.Cancelled })
        : error;
    reporter.error(final);
    return isBtkError(final) ? final.exitCode : ExitCode.Failure;
  }
}

function stdoutColor(environment: Environment, io: BtkIO): boolean {
  return environment.color && io.stdout.isTTY === true;
}
