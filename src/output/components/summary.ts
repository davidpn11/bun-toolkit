import { icons } from "../palette.ts";
import type { Styler } from "../style.ts";

export type SummaryTone = "success" | "warning" | "error";

/** End-of-command stats line: `✔ Done · 3 files · 1.2 MB saved · 340ms`. An empty key shows the value alone. */
export function renderSummary(
  s: Styler,
  stats: Record<string, string | number>,
  options: { title?: string; plain?: boolean; tone?: SummaryTone } = {},
): string {
  const entries = Object.entries(stats);
  if (options.plain) {
    const parts = entries.map(([key, value]) => (key ? `${key}=${value}` : String(value)));
    return [options.title ?? "summary", ...parts].join(" ");
  }
  const parts = entries.map(([key, value]) =>
    key ? `${s.bold(String(value))} ${s.muted(key)}` : s.bold(String(value)),
  );
  const tone = options.tone ?? "success";
  const icon = {
    success: s.success(icons.success),
    warning: s.warning(icons.warning),
    error: s.error(icons.error),
  }[tone];
  return [`${icon} ${s.bold(options.title ?? "Done")}`, ...parts].join(s.muted(" · "));
}
