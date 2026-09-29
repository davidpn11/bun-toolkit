import { icons } from "../palette.ts";
import type { Styler } from "../style.ts";

export type LogLevel = "error" | "warn" | "info" | "success" | "debug";

/** `✔ message`, with continuation lines indented under the text. */
export function renderLog(s: Styler, level: LogLevel, message: string): string {
  const [icon, paint]: [string, (text: string) => string] = {
    error: [icons.error, s.error],
    warn: [icons.warning, s.warning],
    info: [icons.info, s.accent],
    success: [icons.success, s.success],
    debug: [icons.debug, s.muted],
  }[level] as [string, (text: string) => string];
  const [first = "", ...rest] = message.split("\n");
  const body = level === "debug" ? s.muted(first) : first;
  return [`${paint(icon)} ${body}`, ...rest.map((line) => `  ${line}`)].join("\n");
}
