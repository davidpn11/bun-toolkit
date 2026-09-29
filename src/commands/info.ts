import { defineCommand } from "../cli/define.ts";
import type { ConfigFileStatus } from "../config/loader.ts";
import type { BtkContext } from "../context.ts";
import { NAME } from "../version.ts";

export type ConfigFileSummary = {
  path: string | null;
  status: "ok" | "invalid" | "unreadable" | "missing";
  problems: number;
};

export type InfoResult = {
  name: string;
  version: string;
  bun: string;
  platform: string;
  arch: string;
  outputMode: string;
  outputReason: string;
  interactive: boolean;
  globalConfigDir: string;
  config: { global: ConfigFileSummary; project: ConfigFileSummary };
  tools: string[];
};

function summarize(file: ConfigFileStatus | undefined): ConfigFileSummary {
  if (!file) return { path: null, status: "missing", problems: 0 };
  return { path: file.path, status: file.status, problems: file.issues.length };
}

/** Shared by `btk info` and the TUI's Info screen. */
export function collectInfo(ctx: BtkContext): InfoResult {
  return {
    name: NAME,
    version: ctx.version,
    bun: ctx.bunVersion,
    platform: ctx.platform,
    arch: ctx.arch,
    outputMode: ctx.outputMode,
    outputReason: ctx.environment.reason,
    interactive: ctx.isInteractive,
    globalConfigDir: ctx.configInfo.globalDir,
    config: {
      global: summarize(ctx.configInfo.files.global),
      project: summarize(ctx.configInfo.files.project),
    },
    tools: ctx.registry.entries.filter((e) => e.kind === "tool" && !e.builtin).map((e) => e.name),
  };
}

export function describeConfigFile(file: ConfigFileSummary, display: string | undefined): string {
  switch (file.status) {
    case "missing":
      return "not found";
    case "ok":
      return display ?? file.path ?? "";
    case "invalid":
      return `${display} (invalid: ${file.problems} ${file.problems === 1 ? "problem" : "problems"})`;
    case "unreadable":
      return `${display} (could not be loaded)`;
  }
}

export const info = defineCommand({
  name: "info",
  description: "Show versions, platform, output mode and config status",
  examples: ["btk info", "btk info --json"],
  requiresConfig: false,
  run: (_input, ctx) => collectInfo(ctx),
  render(result, out, ctx) {
    const s = out.style;
    const { files } = ctx.configInfo;
    const paint = (summary: ConfigFileSummary, text: string) =>
      summary.status === "ok"
        ? s.success(text)
        : summary.status === "missing"
          ? s.muted(text)
          : s.error(text);

    out.keyValue(
      {
        [NAME]: result.version,
        bun: result.bun,
        platform: `${result.platform}-${result.arch}`,
        output: `${result.outputMode} ${s.muted(`(${result.outputReason})`)}`,
        interactive: result.interactive ? "yes" : "no",
        "global config": paint(
          result.config.global,
          describeConfigFile(result.config.global, files.global?.displayPath),
        ),
        "project config": paint(
          result.config.project,
          describeConfigFile(result.config.project, files.project?.displayPath),
        ),
        tools: result.tools.length > 0 ? result.tools.join(", ") : s.muted("none installed yet"),
      },
      "Environment",
    );
    if (ctx.configInfo.error) {
      out.text();
      out.text(s.warning(`Config has problems. Run "btk config validate" for details.`));
    }
  },
});
