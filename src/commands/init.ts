import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand, flag } from "../cli/define.ts";
import { displayPath } from "../config/loader.ts";
import { CONFIG_FILENAMES, GLOBAL_CONFIG_FILENAMES, globalConfigDir } from "../config/paths.ts";
import { BtkError } from "../errors.ts";
import { icons } from "../output/palette.ts";

export function configTemplate(scope: "project" | "global"): string {
  const intro =
    scope === "global"
      ? "// Global bun-toolkit config: personal defaults for every project.\n// A project's btk.config.ts overrides anything set here."
      : "// bun-toolkit project config. Overrides ~/.bun-toolkit/config.ts.\n// Check it with `btk config validate`, inspect values with `btk config show`.";
  return `${intro}
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  // Per-tool defaults, keyed by tool name.
  tools: {},

  output: {
    // verbose: false,
  },
});
`;
}

export type InitResult = {
  path: string;
  scope: "project" | "global";
  overwritten: boolean;
};

export const init = defineCommand({
  name: "init",
  description: "Create a btk.config.ts (or the global config with --global)",
  examples: ["btk init", "btk init --global", "btk init --force"],
  requiresConfig: false,
  args: {
    global: flag(z.boolean().default(false), { description: "Create ~/.bun-toolkit/config.ts instead" }),
    force: flag(z.boolean().default(false), { description: "Overwrite an existing config without asking" }),
  },
  async run(input, ctx): Promise<InitResult> {
    const scope = input.global ? "global" : "project";
    const dir = input.global ? globalConfigDir(ctx.env) : ctx.cwd;
    const names = input.global ? GLOBAL_CONFIG_FILENAMES : CONFIG_FILENAMES;
    const path = join(dir, names[0]);
    const existing = names.map((name) => join(dir, name)).find((p) => existsSync(p));

    let overwritten = false;
    if (existing) {
      const shown = displayPath(existing, ctx.cwd);
      if (!input.force) {
        if (!ctx.prompter.interactive) {
          throw new BtkError(`A config already exists at ${shown}`, {
            code: "ERR_CONFIG_EXISTS",
            hint: `Pass --force to overwrite it`,
          });
        }
        const ok = await ctx.prompter.confirm(`Overwrite ${shown}?`, { initial: false });
        if (!ok)
          throw new BtkError("Left the existing config unchanged", { code: "ERR_CANCELLED", exitCode: 1 });
      }
      overwritten = true;
      if (existing !== path) await Bun.file(existing).delete();
    }

    mkdirSync(dir, { recursive: true });
    await Bun.write(path, configTemplate(scope));
    return { path, scope, overwritten };
  },
  render(result, out, ctx) {
    const s = out.style;
    const shown = displayPath(result.path, ctx.cwd);
    out.text(`${s.success(icons.success)} ${result.overwritten ? "Replaced" : "Created"} ${s.bold(shown)}`);
    out.text(s.muted(`  ${icons.arrow} Edit it, then run "btk config validate"`));
  },
});
