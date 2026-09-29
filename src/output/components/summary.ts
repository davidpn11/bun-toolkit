import { icons } from "../palette.ts";
import type { Styler } from "../style.ts";

/** End-of-command stats line: `✔ Done · 3 files · 1.2 MB saved · 340ms`. */
export function renderSummary(
  s: Styler,
  stats: Record<string, string | number>,
  options: { title?: string; plain?: boolean } = {},
): string {
  const parts = Object.entries(stats).map(([key, value]) =>
    options.plain ? `${key}=${value}` : `${s.bold(String(value))} ${s.muted(key)}`,
  );
  if (options.plain) return [options.title ?? "summary", ...parts].join(" ");
  const head = `${s.success(icons.success)} ${s.bold(options.title ?? "Done")}`;
  return [head, ...parts].join(s.muted(" · "));
}
