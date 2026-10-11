import { padEndVisible, type Styler, visibleWidth } from "../style.ts";

export function renderNotice(s: Styler, lines: string[], options: { plain?: boolean } = {}): string {
  if (options.plain) return lines.map((line) => `! ${line}`).join("\n");
  const width = Math.max(0, ...lines.map(visibleWidth));
  const edge = (text: string) => s.accent(text);
  return [
    edge(`╭${"─".repeat(width + 2)}╮`),
    ...lines.map((line) => `${edge("│")} ${padEndVisible(line, width)} ${edge("│")}`),
    edge(`╰${"─".repeat(width + 2)}╯`),
  ].join("\n");
}
