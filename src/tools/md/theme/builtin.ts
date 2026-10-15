import { ACCENT } from "../../../output/palette.ts";
import { BTK_CSS, PLAIN_CSS } from "./css.ts";
import type { MdTheme, TerminalTheme } from "./types.ts";

const accent = { color: ACCENT };
const muted = { color: "gray" };

const btkTerminal: TerminalTheme = {
  heading: [{ ...accent, bold: true }, { ...accent, bold: true }, { bold: true }, { bold: true, dim: true }],
  headingRule: muted,
  strong: { bold: true },
  emphasis: { italic: true },
  strikethrough: { strikethrough: true, dim: true },
  codespan: { color: "yellow" },
  link: { ...accent, underline: true },
  url: muted,
  image: { ...muted, italic: true },
  blockquote: accent,
  rule: muted,
  html: muted,
  codeBlock: { border: muted, language: { ...accent, italic: true }, text: {} },
  table: { border: muted, header: { bold: true } },
  list: { bullet: accent, number: accent, taskDone: { color: "green" }, taskTodo: muted },
  syntax: {
    keyword: { color: "magenta" },
    type: { color: "blue" },
    string: { color: "green" },
    literal: { color: "yellow" },
    comment: { ...muted, italic: true },
    punctuation: muted,
  },
  glyphs: {
    bullets: ["•", "◦", "▪"],
    heading: [""],
    taskDone: "✔",
    taskTodo: "○",
    quote: "│",
    rule: "─",
    box: "rounded",
  },
};

const none = {};

const plainTerminal: TerminalTheme = {
  heading: [none],
  headingRule: none,
  strong: none,
  emphasis: none,
  strikethrough: none,
  codespan: none,
  link: none,
  url: none,
  image: none,
  blockquote: none,
  rule: none,
  html: none,
  codeBlock: { border: none, language: none, text: none },
  table: { border: none, header: none },
  list: { bullet: none, number: none, taskDone: none, taskTodo: none },
  syntax: { keyword: none, type: none, string: none, literal: none, comment: none, punctuation: none },
  glyphs: {
    bullets: ["*", "-", "+"],
    heading: ["# ", "## ", "### ", "#### ", "##### ", "###### "],
    taskDone: "[x]",
    taskTodo: "[ ]",
    quote: "|",
    rule: "-",
    box: "ascii",
  },
};

export const DEFAULT_THEME = "btk";

export const BTK_THEME = {
  name: DEFAULT_THEME,
  description: "Bun pink accents, light and dark",
  terminal: btkTerminal,
  css: BTK_CSS,
} satisfies MdTheme;

export const BUILTIN_THEMES: readonly MdTheme[] = [
  BTK_THEME,
  {
    name: "plain",
    description: "No colors and ASCII characters, for piping and printing",
    terminal: plainTerminal,
    css: PLAIN_CSS,
  },
];
