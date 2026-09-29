import { icons } from "../palette.ts";
import type { Styler } from "../style.ts";

export function renderList(
  s: Styler,
  items: string[],
  options: { title?: string; ordered?: boolean; plain?: boolean } = {},
): string {
  const out: string[] = [];
  if (options.title) out.push(options.plain ? options.title : s.title(options.title));
  items.forEach((item, i) => {
    const marker = options.ordered ? `${i + 1}.` : options.plain ? "-" : icons.bullet;
    out.push(`${options.title ? "  " : ""}${options.plain ? marker : s.accent(marker)} ${item}`);
  });
  return out.join("\n");
}
