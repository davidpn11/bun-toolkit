import { z } from "zod";
import {
  createRegistry,
  defineAction,
  defineTool,
  flag,
  positional,
  type Registry,
} from "../../src/cli/define.ts";
import { builtins } from "../../src/commands/index.ts";

/**
 * A test-only tool that exercises everything a real Bun API tool would: a config slice with
 * defaults, a default action with variadic positionals, config-backed flags, an alias, a second
 * action and a lazy TUI screen. It is never part of the shipped registry.
 */
export const demoConfig = z.object({
  level: z.number().int().min(1).max(9).default(5),
  mode: z.enum(["fast", "slow"]).default("fast"),
  tags: z.array(z.string()).optional(),
});

const process = defineAction({
  description: "Process some files",
  examples: ["btk demo a.txt b.txt --level 7"],
  args: {
    files: positional(z.array(z.string()).min(1), { description: "Files to process" }),
    level: flag(z.number().int().min(1).max(9), {
      alias: "l",
      config: "level",
      description: "How hard to try",
    }),
    mode: flag(z.enum(["fast", "slow"]), { config: "mode", description: "Speed" }),
    shout: flag(z.boolean().default(false), { description: "Uppercase the output" }),
    label: flag(z.string().optional(), { description: "Optional label" }),
  },
  run: (input) => ({
    files: input.files,
    level: input.level,
    mode: input.mode,
    shout: input.shout,
    label: input.label,
  }),
  render(result, out) {
    out.table(
      result.files.map((file) => ({ file: result.shout ? file.toUpperCase() : file, level: result.level })),
      { title: "Processed" },
    );
    out.summary({ files: result.files.length, mode: result.mode });
  },
});

const fail = defineAction({
  description: "Always fails",
  hidden: true,
  run: () => {
    throw new Error("kaboom");
  },
});

export const demoTool = defineTool({
  name: "demo",
  description: "A fake tool for tests",
  aliases: ["dm"],
  config: demoConfig,
  defaultAction: "process",
  actions: { process, fail },
  ui: () => import("./FakeScreen.tsx"),
});

export function testRegistry(): Registry {
  return createRegistry(builtins, [demoTool]);
}
