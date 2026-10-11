import { Ansis } from "ansis";
import { ACCENT } from "./palette.ts";

type Paint = (text: string) => string;

export type Styler = {
  enabled: boolean;
  accent: Paint;
  success: Paint;
  error: Paint;
  warning: Paint;
  muted: Paint;
  bold: Paint;
  dim: Paint;
  underline: Paint;
  title: Paint;
};

export function createStyler(enabled: boolean): Styler {
  const a = new Ansis(enabled ? 3 : 0);
  return {
    enabled,
    accent: (t) => a.hex(ACCENT)(t),
    success: (t) => a.green(t),
    error: (t) => a.red(t),
    warning: (t) => a.yellow(t),
    muted: (t) => a.gray(t),
    bold: (t) => a.bold(t),
    dim: (t) => a.dim(t),
    underline: (t) => a.underline(t),
    title: (t) => a.bold.hex(ACCENT)(t),
  };
}

export function stripAnsi(text: string): string {
  return Bun.stripANSI(text);
}

export function visibleWidth(text: string): number {
  return Bun.stringWidth(text);
}

export function padEndVisible(text: string, width: number): string {
  const gap = width - visibleWidth(text);
  return gap > 0 ? text + " ".repeat(gap) : text;
}

export function padStartVisible(text: string, width: number): string {
  const gap = width - visibleWidth(text);
  return gap > 0 ? " ".repeat(gap) + text : text;
}
