export type FrontMatter = {
  body: string;
  title: string | undefined;
};

const FRONT_MATTER = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Splits off YAML between `---` lines at the top, as Jekyll, Hugo and VitePress write it. A block that isn't a
 * YAML mapping is left in place, so a document that merely starts with a horizontal rule renders unchanged.
 */
export function splitFrontMatter(source: string): FrontMatter {
  const match = source.match(FRONT_MATTER);
  const data = match ? parseMapping(match[1] ?? "") : undefined;
  if (!match || !data) return { body: source, title: undefined };
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;
  return { body: source.slice(match[0].length), title };
}

function parseMapping(yaml: string): Record<string, unknown> | undefined {
  if (yaml.trim() === "") return {};
  try {
    const value: unknown = Bun.YAML.parse(yaml);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
