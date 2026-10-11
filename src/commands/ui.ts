import { defineCommand } from "../cli/define.ts";
import { launchTui } from "../tui/launch.ts";

export const ui = defineCommand({
  name: "ui",
  description: "Open the interactive dashboard",
  examples: ["btk ui"],
  async run(_input, ctx) {
    await launchTui(ctx);
  },
});
