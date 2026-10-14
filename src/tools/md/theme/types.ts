export type StyleSpec = {
  /** `#rrggbb` or a terminal color name such as `cyan` or `magentaBright`. */
  color?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

export type SyntaxToken = "keyword" | "type" | "string" | "literal" | "comment" | "punctuation";

/** `rounded` ╭─╮, `square` ┌─┐, `ascii` +-+. */
export type BoxStyle = "rounded" | "square" | "ascii";

export type Glyphs = {
  /** Bullet per list depth; the last one repeats for deeper lists. */
  bullets: string[];
  /** Prefix per heading level, such as `"# "`. */
  heading: string[];
  taskDone: string;
  taskTodo: string;
  quote: string;
  rule: string;
  box: BoxStyle;
};

export type TerminalTheme = {
  /** Style per heading level; the last one repeats for deeper levels. */
  heading: StyleSpec[];
  /** Line under level 1 headings, or nothing when `glyphs.rule` is empty. */
  headingRule: StyleSpec;
  strong: StyleSpec;
  emphasis: StyleSpec;
  strikethrough: StyleSpec;
  codespan: StyleSpec;
  link: StyleSpec;
  url: StyleSpec;
  image: StyleSpec;
  blockquote: StyleSpec;
  rule: StyleSpec;
  html: StyleSpec;
  codeBlock: { border: StyleSpec; language: StyleSpec; text: StyleSpec };
  table: { border: StyleSpec; header: StyleSpec };
  list: { bullet: StyleSpec; number: StyleSpec; taskDone: StyleSpec; taskTodo: StyleSpec };
  syntax: Record<SyntaxToken, StyleSpec>;
  glyphs: Glyphs;
};

type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export type TerminalThemeInput = DeepPartial<TerminalTheme>;

export type MdTheme = {
  /** Lowercase, digits and dashes: the value of `--theme`. */
  name: string;
  description?: string;
  /** Theme to start from. Without it, terminal styles start from `btk` and `css` replaces btk's page styles. */
  extends?: string;
  terminal?: TerminalThemeInput;
  /** Stylesheet for the browser preview and `btk md html`. */
  css?: string;
};

export type ResolvedTheme = {
  name: string;
  description: string;
  /** `built-in`, or the plugin that provided it. */
  source: string;
  terminal: TerminalTheme;
  css: string;
};
