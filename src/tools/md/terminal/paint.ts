import { type AnsiColors, Ansis } from "ansis";
import type { StyleSpec, TerminalTheme } from "../theme/types.ts";

export type Paint = (text: string) => string;
export type Painter = (spec: StyleSpec) => Paint;

export type TerminalCtx = {
  theme: TerminalTheme;
  paint: Painter;
  hyperlinks: boolean;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function createPainter(enabled: boolean): Painter {
  const base = new Ansis(enabled ? 3 : 0);
  return (spec) => {
    const chain = applyStyles(applyColors(base, spec), spec);
    if (chain === base) return (text) => text;
    return (text) => (text ? chain(text) : text);
  };
}

function applyColors(a: Ansis, spec: StyleSpec): Ansis {
  let chain = a;
  if (spec.color) chain = HEX.test(spec.color) ? chain.hex(spec.color) : chain[spec.color as AnsiColors];
  if (spec.bg) chain = HEX.test(spec.bg) ? chain.bgHex(spec.bg) : chain[bgName(spec.bg)];
  return chain;
}

function applyStyles(a: Ansis, spec: StyleSpec): Ansis {
  let chain = a;
  if (spec.bold) chain = chain.bold;
  if (spec.dim) chain = chain.dim;
  if (spec.italic) chain = chain.italic;
  if (spec.underline) chain = chain.underline;
  if (spec.strikethrough) chain = chain.strikethrough;
  return chain;
}

function bgName(color: string): AnsiColors {
  return `bg${color[0]?.toUpperCase()}${color.slice(1)}` as AnsiColors;
}

/** Item for a 1-based level, repeating the last one when the list is shorter. */
export function pick<T>(items: readonly T[], level: number): T {
  return items[Math.min(level, items.length) - 1] as T;
}
