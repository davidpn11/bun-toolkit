import type { ToolDef } from "../cli/define.ts";
import type { BtkContext } from "../context.ts";
import { UsageError } from "../errors.ts";
import { BIN } from "../version.ts";

export async function launchTui(ctx: BtkContext, tool?: ToolDef): Promise<void> {
  const { io, environment } = ctx;
  if (environment.mode !== "human" || !io.stdin.isTTY || !io.stdout.isTTY) {
    const why =
      environment.mode === "json"
        ? "JSON output is on"
        : environment.mode === "ci"
          ? `plain output is on (${environment.reason})`
          : "stdin or stdout is not a terminal";
    throw new UsageError("The interactive dashboard needs a terminal", {
      code: "ERR_NOT_INTERACTIVE",
      details: [`Cannot open it because ${why}.`],
      hint: tool
        ? `Run "${BIN} ${tool.name} --help" to use ${tool.name} without the dashboard`
        : `Run "${BIN} --help" to see the commands`,
    });
  }
  const { runTui } = await import("./runtime.tsx");
  await runTui(ctx, tool);
}
