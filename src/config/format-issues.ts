import type { z } from "zod";
import { suggest } from "../cli/suggest.ts";

export type ConfigIssue = {
  path: string;
  message: string;
};

type Issue = z.core.$ZodIssue & { input?: unknown };

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return "an object";
  return String(value);
}

function article(type: string): string {
  if (type === "object" || type === "array") return `an ${type}`;
  return type;
}

function keysAt(schema: z.ZodType, path: PropertyKey[]): string[] {
  let current: unknown = schema;
  const unwrap = (s: unknown): unknown => {
    let node = s as { def?: { type: string; innerType?: unknown } };
    while (node?.def && ["optional", "default", "nullable", "readonly"].includes(node.def.type)) {
      node = node.def.innerType as typeof node;
    }
    return node;
  };
  current = unwrap(current);
  for (const segment of path) {
    const shape = (current as { shape?: Record<string, unknown> }).shape;
    if (!shape) return [];
    current = unwrap(shape[String(segment)]);
  }
  const shape = (current as { shape?: Record<string, unknown> })?.shape;
  return shape ? Object.keys(shape) : [];
}

export function formatIssues(issues: readonly Issue[], schema: z.ZodType): ConfigIssue[] {
  const out: ConfigIssue[] = [];
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    switch (issue.code) {
      case "unrecognized_keys": {
        const known = keysAt(schema, issue.path);
        for (const key of issue.keys) {
          const match = suggest(key, known);
          const what = path === "tools" ? "Unknown tool" : "Unknown key";
          const tail = match
            ? ` Did you mean "${match}"?`
            : known.length > 0
              ? ` Valid keys: ${known.join(", ")}`
              : path === "tools"
                ? " No tools are installed yet"
                : "";
          out.push({ path: path ? `${path}.${key}` : key, message: `${what}.${tail}` });
        }
        break;
      }
      case "invalid_type":
        out.push({
          path,
          message:
            issue.input === undefined
              ? `Required: expected ${article(issue.expected)}`
              : `Expected ${article(issue.expected)}, received ${describe(issue.input)}`,
        });
        break;
      case "invalid_value":
        out.push({
          path,
          message: `Expected one of ${issue.values.map((v) => JSON.stringify(v)).join(", ")}, received ${describe(issue.input)}`,
        });
        break;
      case "too_big":
      case "too_small": {
        const big = issue.code === "too_big";
        const limit = big
          ? (issue as { maximum: number | bigint }).maximum
          : (issue as { minimum: number | bigint }).minimum;
        const inclusive = issue.inclusive !== false;
        const bound = big ? (inclusive ? "at most" : "less than") : inclusive ? "at least" : "greater than";
        const unit = issue.origin === "string" ? " characters" : issue.origin === "array" ? " items" : "";
        out.push({ path, message: `Must be ${bound} ${limit}${unit}, received ${describe(issue.input)}` });
        break;
      }
      default:
        out.push({ path, message: issue.message });
    }
  }
  return out;
}

export function issueLines(issues: ConfigIssue[], indent = "  "): string[] {
  const width = Math.max(0, ...issues.map((i) => i.path.length));
  return issues.map((i) =>
    i.path ? `${indent}${i.path.padEnd(width)}  ${i.message}` : `${indent}${i.message}`,
  );
}
