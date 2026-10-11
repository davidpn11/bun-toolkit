import { UsageError } from "../errors.ts";
import { BIN } from "../version.ts";
import { type ActionDef, type Entry, findAction, findEntry, type Registry, type ToolDef } from "./define.ts";
import { globalFlags, toKebab } from "./global-args.ts";
import { suggest } from "./suggest.ts";

export type Route =
  | { kind: "root-help" }
  | { kind: "version" }
  | { kind: "tool-help"; tool: ToolDef }
  | { kind: "tool-ui"; tool: ToolDef; tokens: string[] }
  | {
      kind: "action";
      path: string;
      entry: Entry;
      tool?: ToolDef;
      action: ActionDef;
      tokens: string[];
    };

const GLOBAL_BOOLEANS = new Set(
  Object.entries(globalFlags).flatMap(([key, spec]) => {
    const names = [`--${toKebab(key)}`];
    if (spec.alias) names.push(`-${spec.alias}`);
    return spec.schema.safeParse(true).success ? names : [];
  }),
);
const GLOBAL_VALUES = new Set(
  Object.keys(globalFlags)
    .filter((key) => !GLOBAL_BOOLEANS.has(`--${toKebab(key)}`))
    .map((key) => `--${toKebab(key)}`),
);

/** True when `flag` appears before any `--` separator. */
export function hasToken(tokens: readonly string[], ...flags: string[]): boolean {
  for (const token of tokens) {
    if (token === "--") return false;
    if (flags.includes(token)) return true;
  }
  return false;
}

export function peekValue(tokens: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    if (token === "--") return undefined;
    if (token === flag) return tokens[i + 1];
    if (token.startsWith(`${flag}=`)) return token.slice(flag.length + 1);
  }
  return undefined;
}

/**
 * Index of the first name (command or action), skipping global flags in front of it.
 * `strict` throws on any other flag; otherwise the search stops there and returns -1.
 */
function nameIndex(tokens: readonly string[], strict: boolean): number {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    if (token === "--") return -1;
    if (!token.startsWith("-")) return i;
    const name = token.split("=")[0] as string;
    if (GLOBAL_BOOLEANS.has(name) || name === "--version" || name === "--ui") continue;
    if (GLOBAL_VALUES.has(name)) {
      if (!token.includes("=")) i++;
      continue;
    }
    if (!strict) return -1;
    throw new UsageError(`Unknown option ${name}`, {
      code: "ERR_UNKNOWN_OPTION",
      hint: `Options for a command go after its name, e.g. "${BIN} <command> ${name}". Run "${BIN} --help".`,
    });
  }
  return -1;
}

export function resolveRoute(argv: readonly string[], registry: Registry): Route {
  const index = nameIndex(argv, true);
  if (index === -1) {
    return hasToken(argv, "--version") && !hasToken(argv, "--help", "-h")
      ? { kind: "version" }
      : { kind: "root-help" };
  }

  const name = argv[index] as string;
  const entry = findEntry(registry, name);
  if (!entry) {
    const names = registry.entries.flatMap((e) => [e.name, ...(e.aliases ?? [])]);
    const match = suggest(name, names);
    throw new UsageError(`Unknown command "${name}"`, {
      code: "ERR_UNKNOWN_COMMAND",
      hint: match ? `Did you mean "${BIN} ${match}"?` : `Run "${BIN} --help" to see all commands`,
    });
  }

  const before = argv.slice(0, index);
  const after = argv.slice(index + 1);

  if (entry.kind === "command") {
    return { kind: "action", path: entry.name, entry, action: entry, tokens: [...before, ...after] };
  }

  const tool = entry;
  const actionIndex = nameIndex(after, false);
  const next = actionIndex === -1 ? undefined : after[actionIndex];
  if (next !== undefined) {
    const found = findAction(tool, next);
    if (found) {
      const [actionName, action] = found;
      return {
        kind: "action",
        path: `${tool.name} ${actionName}`,
        entry,
        tool,
        action,
        tokens: [...before, ...after.filter((_, i) => i !== actionIndex)],
      };
    }
    if (!tool.defaultAction) {
      const match = suggest(next, Object.keys(tool.actions));
      throw new UsageError(`Unknown action "${next}" for ${BIN} ${tool.name}`, {
        code: "ERR_UNKNOWN_COMMAND",
        hint: match
          ? `Did you mean "${BIN} ${tool.name} ${match}"?`
          : `Run "${BIN} ${tool.name} --help" to see its actions`,
      });
    }
  }

  const all = [...before, ...after];
  if (next === undefined) {
    if (hasToken(all, "--help", "-h")) return { kind: "tool-help", tool };
    if (tool.ui && hasToken(all, "--ui")) return { kind: "tool-ui", tool, tokens: all };
    if (!tool.defaultAction) return { kind: "tool-help", tool };
  }

  const defaultName = tool.defaultAction as string;
  return {
    kind: "action",
    path: `${tool.name} ${defaultName}`,
    entry,
    tool,
    action: tool.actions[defaultName] as ActionDef,
    tokens: all,
  };
}
