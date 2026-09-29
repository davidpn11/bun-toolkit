import { basename } from "node:path";
import { displayPath } from "../../config/loader.ts";
import { formatBytes, formatDimensions } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { FileResult } from "./optimize.ts";

export type Tone = "success" | "warning" | "error" | "muted";

/** One result row, shared by the CLI table and the dashboard. Tones map to `Styler` methods and `colors`. */
export type FileRow = {
  status: string;
  statusTone: Tone;
  file: string;
  output: string;
  size: string;
  change: string;
  changeTone: Tone;
  note: string;
};

/** Size change as a signed percentage: `-92.3%` smaller, `+4.0%` larger. */
export function formatChange(percent: number): string {
  return percent >= 0 ? `-${percent.toFixed(1)}%` : `+${Math.abs(percent).toFixed(1)}%`;
}

export function changeTone(percent: number): Tone {
  if (percent > 20) return "success";
  return percent >= 0 ? "warning" : "error";
}

export function fileRow(file: FileResult, cwd: string): FileRow {
  const { before, after } = file;
  const converted = file.status === "converted" && before !== undefined && after !== undefined;
  const percent = file.savedPercent ?? 0;
  return {
    status: file.status === "converted" ? icons.success : file.status === "failed" ? icons.error : "–",
    statusTone: file.status === "converted" ? "success" : file.status === "failed" ? "error" : "muted",
    file: displayPath(file.input, cwd),
    output: converted && file.output ? basename(file.output) : "",
    size: converted ? `${formatBytes(before.bytes)} → ${formatBytes(after.bytes)}` : "",
    change: converted ? formatChange(percent) : "",
    changeTone: changeTone(percent),
    note: converted ? dimensionsNote(file) : (file.reason ?? ""),
  };
}

function dimensionsNote({ before, after }: FileResult): string {
  if (!before || !after) return "";
  const from = formatDimensions(before.width, before.height);
  const to = formatDimensions(after.width, after.height);
  return from === to ? to : `${from} → ${to}`;
}
