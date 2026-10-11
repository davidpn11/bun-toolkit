import { UsageError } from "../errors.ts";
import { BIN } from "../version.ts";
import type { ArgsSpec, FlagSpec, PositionalSpec } from "./define.ts";
import { toKebab } from "./global-args.ts";
import { coerceText, describeExpected, inspectSchema, type SchemaInfo } from "./schema-info.ts";
import { suggest } from "./suggest.ts";

export type ValueSource = "flag" | "argument" | "config" | "default";

export type ParseResult = {
  values: Record<string, unknown>;
  sources: Record<string, ValueSource>;
};

type FlagEntry = {
  key: string;
  long: string;
  spec: FlagSpec;
  info: SchemaInfo;
};

type PositionalEntry = {
  key: string;
  spec: PositionalSpec;
  info: SchemaInfo;
};

type SpecIndex = {
  flags: FlagEntry[];
  positionals: PositionalEntry[];
  byLong: Map<string, FlagEntry>;
  byShort: Map<string, FlagEntry>;
};

type Scan = {
  raw: Map<string, unknown>;
  loose: string[];
};

type Resolved = ParseResult & { problems: string[] };

export type ParseOptions = {
  /** How to invoke the command, used in error hints (`btk config show`). */
  commandPath: string;
  toolName?: string | undefined;
  /** Resolved `tools.<toolName>` config: the fallback for flags that declare `config`. */
  toolConfig?: Record<string, unknown> | undefined;
};

/**
 * Parses argv tokens against an args spec, then validates each value through its zod schema.
 * Every problem is a UsageError with the flag name, what was expected, and a suggestion.
 */
export function parseArgs(tokens: readonly string[], spec: ArgsSpec, options: ParseOptions): ParseResult {
  const index = indexSpec(spec);
  const helpHint = `Run "${BIN} ${options.commandPath} --help" to see the available options`;
  const { raw, loose } = scanTokens(tokens, index, helpHint);

  const resolved: Resolved = { values: {}, sources: {}, problems: [] };
  resolvePositionals(index.positionals, loose, options, resolved);
  if (loose.length > 0) {
    throw new UsageError(`Unexpected argument "${loose[0]}"`, {
      code: "ERR_UNEXPECTED_ARGUMENT",
      hint: helpHint,
    });
  }
  resolveFlags(index.flags, raw, options, resolved);
  throwIfInvalid(resolved.problems, helpHint);

  return { values: resolved.values, sources: resolved.sources };
}

function indexSpec(spec: ArgsSpec): SpecIndex {
  const flags: FlagEntry[] = [];
  const positionals: PositionalEntry[] = [];
  for (const [key, arg] of Object.entries(spec)) {
    const info = inspectSchema(arg.schema);
    if (arg.kind === "flag") flags.push({ key, long: toKebab(key), spec: arg, info });
    else positionals.push({ key, spec: arg, info });
  }
  return {
    flags,
    positionals,
    byLong: new Map(flags.map((f) => [f.long, f])),
    byShort: new Map(flags.filter((f) => f.spec.alias).map((f) => [f.spec.alias as string, f])),
  };
}

function scanTokens(tokens: readonly string[], index: SpecIndex, helpHint: string): Scan {
  const scan: Scan = { raw: new Map(), loose: [] };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    if (token === "--") {
      scan.loose.push(...tokens.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) i += readLongFlag(token, tokens[i + 1], index, scan, helpHint);
    else if (isShortFlags(token)) i += readShortFlags(token, tokens[i + 1], index, scan, helpHint);
    else scan.loose.push(token);
  }
  return scan;
}

/** `--name`, `--name value`, `--name=value` and `--no-name` for booleans. */
function readLongFlag(
  token: string,
  next: string | undefined,
  index: SpecIndex,
  scan: Scan,
  helpHint: string,
): number {
  const eq = token.indexOf("=");
  const name = token.slice(2, eq === -1 ? undefined : eq);
  const inline = eq === -1 ? undefined : token.slice(eq + 1);
  const entry = index.byLong.get(name);

  if (!entry) {
    const negated = name.startsWith("no-") ? index.byLong.get(name.slice(3)) : undefined;
    if (negated?.info.kind !== "boolean" || inline !== undefined) unknownFlag(token, index, helpHint);
    scan.raw.set(negated.key, false);
    return 0;
  }
  if (entry.info.kind === "boolean") {
    scan.raw.set(entry.key, inline ?? true);
    return 0;
  }
  if (inline !== undefined) {
    assign(scan.raw, entry, inline);
    return 0;
  }
  assign(scan.raw, entry, takeValue(entry, `--${name}`, next));
  return 1;
}

/** `-v`, grouped booleans `-abc`, and a value attached (`-o5`, `-o=5`) or following (`-o 5`). */
function readShortFlags(
  token: string,
  next: string | undefined,
  index: SpecIndex,
  scan: Scan,
  helpHint: string,
): number {
  const letters = token.slice(1);
  for (let j = 0; j < letters.length; j++) {
    const letter = letters[j] as string;
    const entry = index.byShort.get(letter) ?? unknownFlag(`-${letter}`, index, helpHint);
    if (entry.info.kind === "boolean") {
      scan.raw.set(entry.key, true);
      continue;
    }
    const rest = letters.slice(j + 1).replace(/^=/, "");
    if (rest) {
      assign(scan.raw, entry, rest);
      return 0;
    }
    assign(scan.raw, entry, takeValue(entry, `-${letter}`, next));
    return 1;
  }
  return 0;
}

function isNegativeNumber(token: string): boolean {
  return /^-\d/.test(token);
}

function isShortFlags(token: string): boolean {
  return token.startsWith("-") && token.length > 1 && !isNegativeNumber(token);
}

function assign(raw: Map<string, unknown>, entry: FlagEntry, value: unknown): void {
  if (entry.info.kind === "array") {
    const list = (raw.get(entry.key) as unknown[] | undefined) ?? [];
    raw.set(entry.key, [...list, value]);
  } else {
    raw.set(entry.key, value);
  }
}

function takeValue(entry: FlagEntry, display: string, next: string | undefined): string {
  if (next === undefined || (next.startsWith("-") && !isNegativeNumber(next))) {
    throw new UsageError(`Option ${display} needs a value`, {
      code: "ERR_MISSING_VALUE",
      hint: `Expected ${describeExpected(entry.info)}, e.g. ${display} ${entry.spec.valueHint ?? exampleValue(entry.info)}`,
    });
  }
  return next;
}

function unknownFlag(token: string, index: SpecIndex, helpHint: string): never {
  const name = token.replace(/^-+/, "").split("=")[0] ?? "";
  const match = suggest(name, index.byLong.keys());
  throw new UsageError(`Unknown option ${token.split("=")[0]}`, {
    code: "ERR_UNKNOWN_OPTION",
    hint: match ? `Did you mean --${match}?` : helpHint,
  });
}

function resolvePositionals(
  positionals: PositionalEntry[],
  loose: string[],
  options: ParseOptions,
  out: Resolved,
): void {
  for (const { key, spec, info } of positionals) {
    const label = `<${spec.valueHint ?? key}>`;
    const value = takePositional(info, loose);
    if (value === undefined && !info.optional) {
      throw new UsageError(`Missing argument ${label}`, {
        code: "ERR_MISSING_ARGUMENT",
        hint: `${spec.description}. Usage: ${BIN} ${options.commandPath} ${label}`,
      });
    }
    const parsed = spec.schema.safeParse(value);
    if (parsed.success) {
      out.values[key] = parsed.data;
      out.sources[key] = value === undefined ? "default" : "argument";
    } else {
      out.problems.push(`${label}: ${issueText(parsed.error.issues[0], info, value)}`);
    }
  }
}

function takePositional(info: SchemaInfo, loose: string[]): unknown {
  if (info.kind === "array") {
    return loose.length > 0
      ? loose.splice(0).map((v) => coerceText(v, info.itemKind ?? "string"))
      : undefined;
  }
  const next = loose.shift();
  return next === undefined ? undefined : coerceText(next, info.kind);
}

function resolveFlags(
  flags: FlagEntry[],
  raw: Map<string, unknown>,
  options: ParseOptions,
  out: Resolved,
): void {
  for (const entry of flags) {
    const { value, source } = flagValue(entry, raw, options);
    const parsed = entry.spec.schema.safeParse(value);
    if (parsed.success) {
      out.values[entry.key] = parsed.data;
      out.sources[entry.key] = source;
    } else {
      const from = source === "config" ? ` (from config tools.${options.toolName}.${entry.spec.config})` : "";
      out.problems.push(`--${entry.long}${from}: ${issueText(parsed.error.issues[0], entry.info, value)}`);
    }
  }
}

function flagValue(
  entry: FlagEntry,
  raw: Map<string, unknown>,
  options: ParseOptions,
): { value: unknown; source: ValueSource } {
  if (raw.has(entry.key)) return { value: coerceGiven(entry.info, raw.get(entry.key)), source: "flag" };

  const fromConfig = entry.spec.config ? options.toolConfig?.[entry.spec.config] : undefined;
  if (fromConfig !== undefined) return { value: fromConfig, source: "config" };

  if (!entry.info.optional) {
    throw new UsageError(`Missing required option --${entry.long}`, {
      code: "ERR_MISSING_OPTION",
      hint: `${entry.spec.description}. Expected ${describeExpected(entry.info)}`,
    });
  }
  return { value: undefined, source: "default" };
}

function coerceGiven(info: SchemaInfo, given: unknown): unknown {
  if (info.kind === "array" && Array.isArray(given)) {
    return given.map((v) => (typeof v === "string" ? coerceText(v, info.itemKind ?? "string") : v));
  }
  return typeof given === "string" ? coerceText(given, info.kind) : given;
}

function throwIfInvalid(problems: string[], helpHint: string): void {
  if (problems.length === 1) {
    throw new UsageError(`Invalid value for ${problems[0]}`, { code: "ERR_INVALID_VALUE", hint: helpHint });
  }
  if (problems.length > 1) {
    throw new UsageError(`${problems.length} invalid arguments`, {
      code: "ERR_INVALID_VALUE",
      details: problems,
      hint: helpHint,
    });
  }
}

type IssueLike = {
  code: string;
  message: string;
};

function issueText(issue: IssueLike | undefined, info: SchemaInfo, value?: unknown): string {
  const received = value === undefined ? "" : `, received ${JSON.stringify(value)}`;
  if (!issue) return `expected ${describeExpected(info)}${received}`;
  if (["invalid_type", "too_big", "too_small", "invalid_value", "not_multiple_of"].includes(issue.code)) {
    return `expected ${describeExpected(info)}${received}`;
  }
  return issue.message;
}

function exampleValue(info: SchemaInfo): string {
  if (info.kind === "enum") return info.enumValues?.[0] ?? "value";
  if (info.kind === "number") return String(info.min ?? 1);
  return "value";
}
