import type { SyntaxToken } from "./theme/types.ts";

export type CodeToken = { text: string; kind?: SyntaxToken };
export type CodeLine = CodeToken[];

/** The colors `Bun.markdown.ansi()` gives each kind of token. Dim covers comments and punctuation. */
const SGR_KINDS: Record<string, SyntaxToken> = {
  "35": "keyword",
  "34": "type",
  "32": "string",
  "33": "literal",
};

const ESC = String.fromCharCode(27);
const GUTTER = new RegExp(`^${ESC}\\[2m│ ${ESC}\\[0m`);
const SGR_OR_TEXT = new RegExp(`${ESC}\\[([0-9;]*)m|([^${ESC}]+)`, "g");

/**
 * Splits code into lines of tokens, borrowing Bun's highlighter (JavaScript and TypeScript only).
 * Anything it does not recognize comes back as plain text. Tabs become four spaces, as Bun prints them.
 */
export function highlight(code: string, language: string | undefined): CodeLine[] {
  const source = (code.endsWith("\n") ? code.slice(0, -1) : code).replaceAll("\t", "    ");
  const plain = source.split("\n").map((line) => (line ? [{ text: line }] : []));
  if (!language) return plain;
  const rendered = Bun.markdown.ansi(fence(source, language), { columns: 0 });
  const lines = rendered.split("\n").slice(1, -2).map(tokenizeLine);
  return sameText(lines, plain) ? lines : plain;
}

function fence(code: string, language: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${language}\n${code}\n${ticks}\n`;
}

function tokenizeLine(line: string): CodeLine {
  const tokens: CodeLine = [];
  let code: string | undefined;
  for (const [, sgr, text] of line.replace(GUTTER, "").matchAll(SGR_OR_TEXT)) {
    if (sgr !== undefined) code = lastCode(sgr, code);
    else if (text) pushToken(tokens, { text, kind: kindOf(code, text) });
  }
  return tokens;
}

function lastCode(sgr: string, current: string | undefined): string | undefined {
  let code = current;
  for (const part of sgr.split(";")) code = part === "" || part === "0" ? undefined : part;
  return code;
}

function kindOf(code: string | undefined, text: string): SyntaxToken | undefined {
  if (code === "2") return /^\s*(\/\/|\/\*)/.test(text) ? "comment" : "punctuation";
  return code ? SGR_KINDS[code] : undefined;
}

function pushToken(tokens: CodeLine, token: CodeToken): void {
  const previous = tokens.at(-1);
  if (previous && previous.kind === token.kind) previous.text += token.text;
  else tokens.push(token.kind ? token : { text: token.text });
}

function sameText(a: CodeLine[], b: CodeLine[]): boolean {
  const join = (lines: CodeLine[]) => lines.map((line) => line.map((t) => t.text).join("")).join("\n");
  return a.length === b.length && join(a) === join(b);
}
