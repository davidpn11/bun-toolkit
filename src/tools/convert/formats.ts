import { extname } from "node:path";

export const INPUT_FORMATS = ["json", "yaml", "toml", "xml", "json5", "jsonc", "jsonl"] as const;
/** JSONC has no writer in Bun; its output would be plain JSON anyway. */
export const OUTPUT_FORMATS = ["json", "yaml", "toml", "xml", "json5", "jsonl"] as const;

export type InputFormat = (typeof INPUT_FORMATS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const BY_EXTENSION: Record<string, InputFormat> = {
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".json5": "json5",
  ".jsonc": "jsonc",
  ".jsonl": "jsonl",
  ".ndjson": "jsonl",
};

const EXTENSION_FOR: Record<OutputFormat, string> = {
  json: ".json",
  yaml: ".yaml",
  toml: ".toml",
  xml: ".xml",
  json5: ".json5",
  jsonl: ".jsonl",
};

export const DATA_EXTENSIONS = Object.keys(BY_EXTENSION);

export function formatFromPath(path: string): InputFormat | undefined {
  return BY_EXTENSION[extname(path).toLowerCase()];
}

export function extensionsOf(format: InputFormat): string[] {
  return Object.entries(BY_EXTENSION)
    .filter(([, value]) => value === format)
    .map(([ext]) => ext);
}

export function isDataPath(path: string): boolean {
  return formatFromPath(path) !== undefined;
}

export function extensionFor(format: OutputFormat): string {
  return EXTENSION_FOR[format];
}
