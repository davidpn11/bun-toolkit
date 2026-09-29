// bun-toolkit project config. Overrides ~/.bun-toolkit/config.ts.
// Check it with `btk config validate`, inspect values with `btk config show`.
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  // Per-tool defaults, keyed by tool name.
  tools: {},

  output: {
    // verbose: false,
  },
});
