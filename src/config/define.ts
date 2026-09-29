import type { BtkConfig } from "./schema.ts";

/**
 * Identity function that gives `btk.config.ts` autocomplete and type checking.
 *
 * ```ts
 * import { defineConfig } from "bun-toolkit";
 * export default defineConfig({ output: { verbose: true } });
 * ```
 */
export function defineConfig(config: BtkConfig): BtkConfig {
  return config;
}
