import type { z } from "zod";
import type { ToolDef } from "../cli/define.ts";
import { coerceText, describeExpected, inspectSchema } from "../cli/schema-info.ts";
import type { ConfigIssue } from "./format-issues.ts";
import { NO_LOCAL_CONFIG, noLocalConfigSchema } from "./schema.ts";

function toEnvSegment(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase();
}

export function envVarName(toolName: string, key: string): string {
  return `BTK_${toEnvSegment(toolName)}_${toEnvSegment(key)}`;
}

export type EnvLayer = {
  values: Record<string, unknown>;
  /** Dotted config path -> env var that set it. */
  origins: Record<string, string>;
  issues: ConfigIssue[];
};

export function readEnvLayer(
  env: Record<string, string | undefined>,
  toolDefs: readonly ToolDef[],
): EnvLayer {
  const values: Record<string, unknown> = {};
  const origins: Record<string, string> = {};
  const issues: ConfigIssue[] = [];

  const output: Record<string, unknown> = {};
  if (env.BTK_VERBOSE !== undefined && env.BTK_VERBOSE !== "") {
    const v = coerceText(env.BTK_VERBOSE, "boolean");
    if (typeof v === "boolean") {
      output.verbose = v;
      origins["output.verbose"] = "BTK_VERBOSE";
    } else {
      issues.push({
        path: "BTK_VERBOSE",
        message: `Expected true or false, received ${JSON.stringify(env.BTK_VERBOSE)}`,
      });
    }
  }
  if (env.BTK_OUTPUT !== undefined && env.BTK_OUTPUT !== "") {
    if (env.BTK_OUTPUT === "json") {
      output.json = true;
      origins["output.json"] = "BTK_OUTPUT";
    } else {
      issues.push({
        path: "BTK_OUTPUT",
        message: `Expected "json", received ${JSON.stringify(env.BTK_OUTPUT)}`,
      });
    }
  }
  if (Object.keys(output).length > 0) values.output = output;

  const noLocalConfig = env.BTK_NO_LOCAL_CONFIG;
  if (noLocalConfig !== undefined && noLocalConfig !== "") {
    const parsed = noLocalConfigSchema.safeParse(noLocalConfig);
    if (parsed.success) {
      values.noLocalConfig = parsed.data;
      origins.noLocalConfig = "BTK_NO_LOCAL_CONFIG";
    } else {
      issues.push({
        path: "BTK_NO_LOCAL_CONFIG",
        message: `Expected ${NO_LOCAL_CONFIG.join(", ")}, received ${JSON.stringify(noLocalConfig)}`,
      });
    }
  }

  const tools: Record<string, Record<string, unknown>> = {};
  for (const tool of toolDefs) {
    if (!tool.config) continue;
    for (const [key, schema] of Object.entries(tool.config.shape)) {
      const name = envVarName(tool.name, key);
      const raw = env[name];
      if (raw === undefined || raw === "") continue;
      const info = inspectSchema(schema as z.ZodType);
      const candidate =
        info.kind === "array"
          ? raw.split(",").map((part) => coerceText(part.trim(), info.itemKind ?? "string"))
          : coerceText(raw, info.kind);
      const parsed = (schema as z.ZodType).safeParse(candidate);
      if (parsed.success) {
        tools[tool.name] ??= {};
        (tools[tool.name] as Record<string, unknown>)[key] = parsed.data;
        origins[`tools.${tool.name}.${key}`] = name;
      } else {
        issues.push({
          path: name,
          message: `Expected ${describeExpected(info)}, received ${JSON.stringify(raw)}`,
        });
      }
    }
  }
  if (Object.keys(tools).length > 0) values.tools = tools;

  return { values, origins, issues };
}
