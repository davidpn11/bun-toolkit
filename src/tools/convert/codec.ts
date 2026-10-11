import { BtkError } from "../../errors.ts";
import type { InputFormat, OutputFormat } from "./formats.ts";

export type WriteOptions = {
  indent: number;
  pretty: boolean;
  xmlRoot: string;
};

export class ConvertError extends BtkError {
  constructor(message: string, hint?: string, code = "ERR_CONVERT") {
    super(message, { code, ...(hint && { hint }) });
    this.name = "ConvertError";
  }
}

const LABEL: Record<InputFormat, string> = {
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  json5: "JSON5",
  jsonc: "JSONC",
  jsonl: "JSONL",
};

export function parse(text: string, format: InputFormat): unknown {
  try {
    return PARSERS[format](text);
  } catch (error) {
    if (error instanceof ConvertError) throw error;
    const message = error instanceof Error ? error.message.replace(/^\w+ Parse error: /, "") : String(error);
    throw new ConvertError(
      `Invalid ${LABEL[format]}: ${message}`,
      `Check the input, or pass --from if it is not ${LABEL[format]}`,
      "ERR_PARSE",
    );
  }
}

const PARSERS: Record<InputFormat, (text: string) => unknown> = {
  json: (text) => JSON.parse(text),
  yaml: (text) => Bun.YAML.parse(text),
  toml: (text) => Bun.TOML.parse(text),
  xml: (text) => Bun.XML.parse(text),
  json5: (text) => Bun.JSON5.parse(text),
  jsonc: (text) => Bun.JSONC.parse(text),
  jsonl: parseJsonLines,
};

/** Bun.JSONL.parse stops quietly at the first bad line; this reports it instead. */
function parseJsonLines(text: string): unknown[] {
  const { values, read, error } = Bun.JSONL.parseChunk(text);
  if (error) {
    let start = read;
    while (start < text.length && /\s/.test(text[start] ?? "")) start++;
    const line = text.slice(0, start).split("\n").length;
    const message = error.message.replace(/^\w+ Parse error: /, "");
    throw new ConvertError(
      `Invalid JSONL on line ${line}: ${message}`,
      "Each line must be one complete JSON value",
      "ERR_PARSE",
    );
  }
  return values;
}

export function stringify(value: unknown, format: OutputFormat, options: WriteOptions): string {
  const text = WRITERS[format](format === "toml" ? value : plainValues(value), options);
  return text.endsWith("\n") ? text : `${text}\n`;
}

const WRITERS: Record<OutputFormat, (value: unknown, options: WriteOptions) => string> = {
  json: (value, o) => JSON.stringify(value, jsonReplacer, o.pretty ? o.indent : undefined) ?? "null",
  yaml: (value, o) => Bun.YAML.stringify(value, null, o.pretty ? o.indent : undefined),
  toml: (value) => writeToml(value),
  xml: (value, o) =>
    Bun.XML.stringify(
      xmlDocument(value, o.xmlRoot) as Bun.XML.Document,
      null,
      o.pretty ? o.indent : undefined,
    ),
  json5: (value, o) => Bun.JSON5.stringify(value, null, o.pretty ? o.indent : undefined) ?? "null",
  jsonl: (value) =>
    (Array.isArray(value) ? value : [value]).map((item) => JSON.stringify(item, jsonReplacer)).join("\n"),
};

function writeToml(value: unknown): string {
  if (!isPlainObject(value)) {
    const got = Array.isArray(value) ? "a list" : value === null ? "null" : `a ${typeof value}`;
    throw new ConvertError(
      `TOML needs a table (an object with keys) at the top level, but the input is ${got}`,
      "Convert to JSON or YAML instead, or wrap the data in an object",
      "ERR_SHAPE",
    );
  }
  return Bun.TOML.stringify(value) ?? "";
}

/** An XML document has exactly one root element; wrap anything else in `<root>`. */
export function xmlDocument(value: unknown, root: string): unknown {
  if (isPlainObject(value) && Object.keys(value).length === 1) return value;
  if (Array.isArray(value)) return { [root]: { item: value } };
  return { [root]: value };
}

/**
 * TOML dates parse as Temporal objects, which only TOML can write back. Every other writer gets
 * their `toJSON()` string (ISO 8601), the same thing JSON.stringify would use.
 */
function plainValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainValues);
  if (isPlainObject(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plainValues(inner)]));
    }
    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === "function") return toJSON.call(value);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Guesses the format of unlabeled input (stdin). Only claims formats it can confirm by parsing. */
export function sniff(text: string): InputFormat | undefined {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) return "xml";
  if (tryParse(() => JSON.parse(text))) return "json";
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length > 1 && lines.every((line) => tryParse(() => JSON.parse(line)))) return "jsonl";
  return undefined;
}

function tryParse(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
