import type { ToolDef } from "../cli/define.ts";
import { image } from "./image/tool.ts";

/**
 * The tool registry: the only place a Bun API tool is registered.
 *
 * Adding a tool:
 *   1. create `src/tools/<name>/` with `core.ts` (pure logic) and `tool.ts` (`defineTool(...)`)
 *   2. add it to this list
 *
 * Commands, help, config validation (`tools.<name>`), BTK_<NAME>_* env vars, `defineConfig`
 * types and the `btk ui` home screen all pick it up from here.
 */
export const tools = [image] as const satisfies readonly ToolDef[];
