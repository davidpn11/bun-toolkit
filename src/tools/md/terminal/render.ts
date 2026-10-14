import { splitFrontMatter } from "../front-matter.ts";
import type { TerminalTheme } from "../theme/types.ts";
import { parseMarkdown } from "../tree.ts";
import { renderBlocks } from "./blocks.ts";
import { createPainter } from "./paint.ts";

export type TerminalOptions = {
  width: number;
  color: boolean;
  /** OSC 8 links; only written when color is on. */
  hyperlinks: boolean;
};

export function renderTerminal(source: string, theme: TerminalTheme, options: TerminalOptions): string {
  const ctx = {
    theme,
    paint: createPainter(options.color),
    hyperlinks: options.hyperlinks && options.color,
  };
  return renderBlocks(parseMarkdown(splitFrontMatter(source).body), options.width, ctx).join("\n");
}
