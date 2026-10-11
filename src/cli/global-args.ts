import { z } from "zod";
import { type ArgsSpec, flag } from "./define.ts";

export const globalFlags = {
  json: flag(z.boolean().default(false), { description: "Print a single JSON document (also AGENT=true)" }),
  verbose: flag(z.boolean().default(false), { description: "Show debug output and stack traces" }),
  noColor: flag(z.boolean().default(false), { description: "Plain text output, no colors or animation" }),
  config: flag(z.string().optional(), {
    valueHint: "<path>",
    description: "Use this project config file instead of searching for btk.config.ts",
  }),
  help: flag(z.boolean().default(false), { alias: "h", description: "Show help for a command" }),
} satisfies ArgsSpec;

export const uiFlag = {
  ui: flag(z.boolean().default(false), { description: "Open the interactive dashboard for this tool" }),
} satisfies ArgsSpec;

export type GlobalValues = {
  json: boolean;
  verbose: boolean;
  noColor: boolean;
  config: string | undefined;
  help: boolean;
};

export function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
