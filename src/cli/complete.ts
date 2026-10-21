import type { BtkContext } from "../context.ts";
import {
  type ActionDef,
  type ArgSpec,
  type ArgsSpec,
  type Entry,
  type FlagSpec,
  findAction,
  findEntry,
  type Registry,
} from "./define.ts";
import { globalFlags, toKebab, uiFlag } from "./global-args.ts";
import { inspectSchema } from "./schema-info.ts";

export const FILES = ":files";

type Position = { entry?: Entry; action?: ActionDef; picked: boolean; positionals: number };

/** Candidates for the last word, as `value` or `value\tdescription` lines; `:files` asks the shell for paths. */
export function complete(registry: Registry, words: readonly string[], ctx: BtkContext): string[] {
  const current = words.at(-1) ?? "";
  const done = words.slice(0, -1);
  const position = locate(registry, done);
  const pending = valueFlag(specOf(position), done.at(-1) ?? "");
  const candidates = pending
    ? flagValues(pending, ctx)
    : current.startsWith("-")
      ? flagNames(specOf(position))
      : nameCandidates(registry, position);
  return candidates.filter((c) => c === FILES || c.startsWith(current));
}

function locate(registry: Registry, words: readonly string[]): Position {
  const position: Position = { picked: false, positionals: 0 };
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (word.startsWith("-")) {
      if (valueFlag(specOf(position), word)) i++;
    } else if (!position.entry) {
      position.entry = findEntry(registry, word);
      if (position.entry?.kind === "command") position.action = position.entry;
    } else if (position.entry.kind === "tool" && !position.picked && position.positionals === 0) {
      const found = findAction(position.entry, word);
      position.picked = found !== undefined;
      position.action = found?.[1] ?? defaultAction(position.entry);
      if (!found) position.positionals++;
    } else {
      position.positionals++;
    }
  }
  if (position.entry?.kind === "tool" && !position.action) position.action = defaultAction(position.entry);
  return position;
}

function defaultAction(entry: Entry): ActionDef | undefined {
  return entry.kind === "tool" && entry.defaultAction ? entry.actions[entry.defaultAction] : undefined;
}

function specOf({ entry, action }: Position): ArgsSpec {
  const ui = entry?.kind === "tool" && entry.ui ? uiFlag : {};
  return { ...action?.args, ...globalFlags, ...ui };
}

function valueFlag(spec: ArgsSpec, word: string): FlagSpec | undefined {
  if (!word.startsWith("-") || word.includes("=")) return undefined;
  const match = Object.entries(spec).find(
    ([key, s]) => s.kind === "flag" && (word === `--${toKebab(key)}` || (s.alias && word === `-${s.alias}`)),
  )?.[1];
  return match?.kind === "flag" && inspectSchema(match.schema).kind !== "boolean" ? match : undefined;
}

function flagValues(spec: FlagSpec, ctx: BtkContext): string[] {
  return spec.choices?.(ctx) ?? schemaValues(spec);
}

function schemaValues(spec: ArgSpec): string[] {
  const info = inspectSchema(spec.schema);
  if (info.enumValues) return info.enumValues;
  return info.kind === "string" || info.itemKind === "string" ? [FILES] : [];
}

function positionalValues(action: ActionDef | undefined, index: number): string[] {
  const positionals = Object.values(action?.args ?? {}).filter((s) => s.kind === "positional");
  const spec = positionals[index] ?? positionals.findLast((s) => inspectSchema(s.schema).kind === "array");
  return spec ? schemaValues(spec) : [];
}

function flagNames(spec: ArgsSpec): string[] {
  return Object.entries(spec)
    .filter(([, s]) => s.kind === "flag" && !s.hidden)
    .map(([key, s]) => `--${toKebab(key)}\t${s.description}`);
}

function nameCandidates(registry: Registry, position: Position): string[] {
  const { entry, action } = position;
  if (!entry) return registry.entries.filter((e) => !isHidden(e)).map((e) => `${e.name}\t${e.description}`);
  const values = positionalValues(action, position.positionals);
  if (entry.kind === "tool" && !position.picked && position.positionals === 0) {
    const actions = Object.entries(entry.actions)
      .filter(([, a]) => !a.hidden)
      .map(([name, a]) => `${name}\t${a.description}`);
    return [...actions, ...values];
  }
  return values;
}

function isHidden(entry: Entry): boolean {
  return entry.kind === "command" && entry.hidden === true;
}
