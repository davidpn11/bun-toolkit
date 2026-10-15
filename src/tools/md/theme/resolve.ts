import { didYouMean } from "../../../cli/suggest.ts";
import { formatIssues, issueLines } from "../../../config/format-issues.ts";
import { BtkError, UsageError } from "../../../errors.ts";
import type { Hooks } from "../../../plugins/types.ts";
import { BTK_THEME, BUILTIN_THEMES } from "./builtin.ts";
import { mdThemeSchema } from "./schema.ts";
import type { MdTheme, ResolvedTheme, TerminalTheme, TerminalThemeInput } from "./types.ts";

export const BUILT_IN = "built-in";

export type ThemeEntry = {
  theme: MdTheme;
  source: string;
};

type Resolved = Pick<ResolvedTheme, "terminal" | "css">;

/** Built-in themes, then plugin themes in plugin order. A later theme with the same name replaces an earlier one. */
export function availableThemes(hooks: Hooks): ThemeEntry[] {
  const entries = new Map<string, ThemeEntry>();
  for (const theme of BUILTIN_THEMES) entries.set(theme.name, { theme, source: BUILT_IN });
  for (const { plugin, value } of hooks.collect("md:theme", undefined)) {
    for (const theme of [value].flat()) {
      const valid = validateTheme(theme, plugin);
      entries.set(valid.name, { theme: valid, source: plugin });
    }
  }
  return [...entries.values()];
}

export function resolveTheme(name: string, entries: readonly ThemeEntry[]): ResolvedTheme {
  const byName = new Map(entries.map((entry) => [entry.theme.name, entry]));
  const entry = findTheme(name, byName);
  const { terminal, css } = resolveEntry(entry, byName, []);
  return {
    name: entry.theme.name,
    description: entry.theme.description ?? "",
    source: entry.source,
    terminal,
    css,
  };
}

export function validateTheme(theme: unknown, plugin: string): MdTheme {
  const parsed = mdThemeSchema.safeParse(theme);
  if (parsed.success) return parsed.data;
  const name = (theme as { name?: unknown } | null)?.name;
  const label = typeof name === "string" ? `Theme "${name}"` : "A theme";
  throw new BtkError(`${label} from plugin "${plugin}" is invalid`, {
    code: "ERR_THEME",
    details: issueLines(formatIssues(parsed.error.issues, mdThemeSchema), ""),
  });
}

function findTheme(name: string, byName: ReadonlyMap<string, ThemeEntry>, wantedBy?: string): ThemeEntry {
  const entry = byName.get(name);
  if (entry) return entry;
  const subject = wantedBy
    ? `Theme "${wantedBy}" extends unknown theme "${name}"`
    : `Unknown theme "${name}"`;
  throw new UsageError(subject, {
    code: "ERR_UNKNOWN_THEME",
    hint: didYouMean(name, byName.keys()) ?? `Available: ${[...byName.keys()].join(", ")}`,
  });
}

function resolveEntry(
  entry: ThemeEntry,
  byName: ReadonlyMap<string, ThemeEntry>,
  visiting: readonly string[],
): Resolved {
  const { theme } = entry;
  if (visiting.includes(theme.name)) {
    throw new BtkError(`Themes extend each other in a loop: ${[...visiting, theme.name].join(" → ")}`, {
      code: "ERR_THEME",
    });
  }
  if (!theme.extends) {
    return { terminal: mergeTerminal(BTK_THEME.terminal, theme.terminal), css: theme.css ?? BTK_THEME.css };
  }
  const base = resolveEntry(findTheme(theme.extends, byName, theme.name), byName, [...visiting, theme.name]);
  return {
    terminal: mergeTerminal(base.terminal, theme.terminal),
    css: theme.css ? `${base.css}\n${theme.css}` : base.css,
  };
}

/** Style specs replace each other whole; the grouped sections merge key by key. */
export function mergeTerminal(base: TerminalTheme, over: TerminalThemeInput = {}): TerminalTheme {
  return {
    ...base,
    ...over,
    codeBlock: { ...base.codeBlock, ...over.codeBlock },
    table: { ...base.table, ...over.table },
    list: { ...base.list, ...over.list },
    syntax: { ...base.syntax, ...over.syntax },
    glyphs: { ...base.glyphs, ...over.glyphs },
  } as TerminalTheme;
}
