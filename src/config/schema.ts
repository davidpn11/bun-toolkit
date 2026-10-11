import { z } from "zod";
import type { ToolDef } from "../cli/define.ts";
import type { BtkPlugin } from "../plugins/types.ts";
import type { tools } from "../tools/index.ts";
import { type ConfigIssue, formatIssues } from "./format-issues.ts";

export const outputConfigSchema = z.strictObject({
  color: z.boolean().optional(),
  json: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

export const pluginSchema = z.custom<BtkPlugin>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as BtkPlugin).name === "string" &&
    typeof (value as BtkPlugin).setup === "function",
  "Expected a plugin object with a name and a setup() function",
);

type RegisteredTool = (typeof tools)[number];

export type ToolsConfig = {
  [T in RegisteredTool as T["name"]]?: T["config"] extends z.ZodObject
    ? Partial<z.input<T["config"]>>
    : never;
};

export type BtkConfig = {
  tools?: ToolsConfig;
  output?: z.input<typeof outputConfigSchema>;
  plugins?: BtkPlugin[];
};

export type ResolvedConfig = {
  tools: Record<string, Record<string, unknown>>;
  output: z.output<typeof outputConfigSchema>;
  plugins: BtkPlugin[];
};

function stripDefault(schema: z.ZodType): z.ZodType {
  const def = (schema as unknown as { def: { type: string; innerType?: z.ZodType } }).def;
  return def.type === "default" || def.type === "prefault"
    ? stripDefault(def.innerType as z.ZodType)
    : schema;
}

/**
 * A tool's config slice as it may appear in a file: every key optional, no defaults injected
 * (defaults are applied once, after merging, so `config show` can say where each value came from).
 */
export function fileSliceSchema(config: z.ZodObject) {
  const shape = Object.fromEntries(
    Object.entries(config.shape).map(([key, schema]) => [key, stripDefault(schema as z.ZodType).optional()]),
  );
  return z.strictObject(shape);
}

export function buildConfigFileSchema(toolDefs: readonly ToolDef[]) {
  const toolShapes: Record<string, z.ZodType> = {};
  for (const tool of toolDefs) {
    if (tool.config) toolShapes[tool.name] = fileSliceSchema(tool.config).optional();
  }
  return z.strictObject({
    tools: z.strictObject(toolShapes).optional(),
    output: outputConfigSchema.optional(),
    plugins: z.array(pluginSchema).optional(),
  });
}

export function defaultsLayer(toolDefs: readonly ToolDef[]): Record<string, unknown> {
  const toolDefaults: Record<string, unknown> = {};
  for (const tool of toolDefs) {
    if (!tool.config) continue;
    const parsed = tool.config.safeParse({});
    if (parsed.success) toolDefaults[tool.name] = stripUndefined(parsed.data as Record<string, unknown>);
  }
  return { tools: toolDefaults, output: {}, plugins: [] };
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Applies defaults to the merged layers. Each layer was already validated on its own, but a tool
 * schema with cross-field rules can still reject the combination; those tools fall back to their
 * defaults and the problems are returned so the caller can report them.
 */
export function finalizeConfig(
  merged: Record<string, unknown>,
  toolDefs: readonly ToolDef[],
): { config: ResolvedConfig; issues: ConfigIssue[] } {
  const rawTools = (merged.tools ?? {}) as Record<string, Record<string, unknown>>;
  const resolvedTools: Record<string, Record<string, unknown>> = {};
  const issues: ConfigIssue[] = [];
  for (const tool of toolDefs) {
    if (!tool.config) continue;
    const parsed = tool.config.safeParse(rawTools[tool.name] ?? {}, { reportInput: true });
    if (parsed.success) {
      resolvedTools[tool.name] = parsed.data as Record<string, unknown>;
      continue;
    }
    resolvedTools[tool.name] = (tool.config.safeParse({}).data as Record<string, unknown>) ?? {};
    for (const issue of formatIssues(parsed.error.issues, tool.config)) {
      issues.push({ ...issue, path: issue.path ? `tools.${tool.name}.${issue.path}` : `tools.${tool.name}` });
    }
  }
  return {
    config: {
      tools: resolvedTools,
      output: (merged.output ?? {}) as ResolvedConfig["output"],
      plugins: (merged.plugins ?? []) as BtkPlugin[],
    },
    issues,
  };
}
