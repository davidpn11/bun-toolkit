import { formatValue } from "../format.ts";
import { padEndVisible, type Styler } from "../style.ts";

export function renderKeyValue(
  s: Styler,
  pairs: Record<string, unknown>,
  options: { title?: string; plain?: boolean } = {},
): string {
  const entries = Object.entries(pairs);
  const width = Math.max(0, ...entries.map(([key]) => key.length));
  const out: string[] = [];
  if (options.title) out.push(options.plain ? options.title : s.title(options.title));
  for (const [key, value] of entries) {
    const label = options.plain ? `${key}:` : s.muted(padEndVisible(key, width));
    out.push(`${options.title ? "  " : ""}${label} ${options.plain ? "" : " "}${formatValue(value)}`);
  }
  return out.join("\n");
}
