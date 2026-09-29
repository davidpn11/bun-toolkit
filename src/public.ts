/**
 * The package's only export. bun-toolkit is a CLI, not a library: this exists so `btk.config.ts`
 * gets types and autocomplete.
 */
export { defineConfig } from "./config/define.ts";
export type { BtkConfig, ToolsConfig } from "./config/schema.ts";
export type { BtkPlugin, HookRegistry } from "./plugins/types.ts";
