import { basename } from "node:path";
import { displayPath } from "../../config/loader.ts";
import type { BtkContext } from "../../context.ts";
import type { SummaryTone } from "../../output/components/summary.ts";
import { changeTone, formatBytes, formatChange, formatDuration, pluralize } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { Output } from "../../output/reporter.ts";
import type { JobResult } from "./compress.ts";
import type { DecompressResult as FileResult } from "./decompress.ts";
import type { CompressResult, DecompressResult, StreamResult } from "./tool.ts";

type Status = "done" | "skipped" | "failed";

export function renderCompress(result: CompressResult, out: Output, ctx: BtkContext): void {
  if (result.mode === "stream") return renderStream(result, out, ctx, "compressed");
  const s = out.style;
  const rows = result.results.map((job) => compressRow(job, ctx.cwd));
  out.table(rows, {
    columns: [
      { key: "status", label: "", paint: (text, row) => paintStatus(s, row.state as Status, text) },
      { key: "file" },
      { key: "output", paint: (text) => s.muted(text) },
      { key: "size", align: "right" },
      { key: "change", align: "right", paint: (text, row) => (text ? s[row.tone as "success"](text) : text) },
      { key: "note", paint: (text, row) => (row.state === "done" ? s.muted(text) : text) },
    ],
  });
  renderNotes(out, result.results, result.missing);
  const { done, skipped, failed, beforeBytes, afterBytes, savedPercent } = result.totals;
  const stats: Record<string, string | number> = { compressed: done };
  if (skipped > 0) stats.skipped = skipped;
  if (failed > 0) stats.failed = failed;
  if (done > 0) {
    stats[""] = `${formatBytes(beforeBytes)} → ${formatBytes(afterBytes)}`;
    stats.saved = `${savedPercent.toFixed(1)}%`;
  }
  stats.elapsed = formatDuration(result.durationMs);
  out.text();
  out.summary(stats, title(result), tone(result));
}

export function renderDecompress(result: DecompressResult, out: Output, ctx: BtkContext): void {
  if (result.mode === "stream") return renderStream(result, out, ctx, "decompressed");
  const s = out.style;
  out.table(
    result.results.map((file) => decompressRow(file, ctx.cwd)),
    {
      columns: [
        { key: "status", label: "", paint: (text, row) => paintStatus(s, row.state as Status, text) },
        { key: "file" },
        { key: "output", paint: (text) => s.muted(text) },
        { key: "size", align: "right" },
        { key: "note", paint: (text, row) => (row.state === "done" ? s.muted(text) : text) },
      ],
    },
  );
  renderNotes(out, result.results, result.missing);
  const { done, skipped, failed } = result.totals;
  const stats: Record<string, number> = { decompressed: done };
  if (skipped > 0) stats.skipped = skipped;
  if (failed > 0) stats.failed = failed;
  out.text();
  out.summary(stats, title(result), tone(result));
}

/** Stream results print only the bytes to stdout; the size line goes to stderr. */
function renderStream(result: StreamResult, out: Output, ctx: BtkContext, verb: string): void {
  const sizes = `${formatBytes(result.before)} → ${formatBytes(result.after)}`;
  if (result.path) {
    out.text(
      `${out.style.success(icons.success)} Wrote ${out.style.bold(displayPath(result.path, ctx.cwd))} ${out.style.muted(`(${result.format}, ${sizes})`)}`,
    );
    return;
  }
  out.raw(result.data);
  ctx.reporter.log.success(`${verb} with ${result.format} · ${sizes}`);
}

export function compressRow(job: JobResult, cwd: string): Record<string, unknown> {
  const done = job.status === "done";
  const sized = job.before !== undefined && job.after !== undefined;
  const note =
    job.kind === "folder"
      ? `${pluralize(job.files ?? 0, "file")} · ${job.format} ${job.level}`
      : `${job.format} ${job.level}`;
  return {
    state: job.status,
    status: statusIcon(job.status),
    file: displayPath(job.input, cwd) + (job.kind === "folder" ? "/" : ""),
    output: done ? basename(job.output) : "",
    size: sized ? `${formatBytes(job.before ?? 0)} → ${formatBytes(job.after ?? 0)}` : "",
    change: sized ? formatChange(job.savedPercent ?? 0) : "",
    tone: changeTone(job.savedPercent ?? 0),
    note: done ? note : (job.reason ?? ""),
  };
}

export function decompressRow(file: FileResult, cwd: string): Record<string, unknown> {
  const done = file.status === "done";
  const output = file.output ? basename(file.output) + (file.kind === "folder" ? "/" : "") : "";
  const note =
    file.kind === "folder"
      ? `${pluralize(file.files ?? 0, "file")} extracted · ${file.format}`
      : (file.format ?? "");
  return {
    state: file.status,
    status: statusIcon(file.status),
    file: displayPath(file.input, cwd),
    output: done ? output : "",
    size: done ? `${formatBytes(file.before ?? 0)} → ${formatBytes(file.after ?? 0)}` : "",
    note: done ? note : (file.reason ?? ""),
  };
}

function renderNotes(out: Output, results: { hint?: string }[], missing: string[]): void {
  const s = out.style;
  const hints = [...new Set(results.map((r) => r.hint).filter((h): h is string => Boolean(h)))];
  const lines = [
    ...missing.map((p) => `${s.warning(icons.warning)} Nothing matched ${p}`),
    ...hints.map((h) => s.muted(`${icons.arrow} ${h}`)),
  ];
  if (lines.length > 0) out.text();
  for (const line of lines) out.text(line);
}

function statusIcon(status: Status): string {
  return status === "done" ? icons.success : status === "failed" ? icons.error : "–";
}

function paintStatus(s: Output["style"], status: Status, text: string): string {
  if (status === "done") return s.success(text);
  return status === "failed" ? s.error(text) : s.muted(text);
}

function title(report: { cancelled: boolean; dryRun: boolean }): string {
  if (report.cancelled) return "Cancelled";
  return report.dryRun ? "Dry run" : "Done";
}

type BatchReport = {
  totals: { done: number; failed: number };
  missing: string[];
  cancelled: boolean;
};

function tone({ totals, missing, cancelled }: BatchReport): SummaryTone {
  if (totals.failed > 0 && totals.done === 0) return "error";
  return totals.failed > 0 || missing.length > 0 || cancelled ? "warning" : "success";
}

type FormatRow = { name: string; extension: string; min: number; max: number; level: number };

export function renderFormats(rows: FormatRow[], out: Output): void {
  out.table(
    rows.map((row) => ({
      format: row.name,
      extension: row.extension,
      levels: `${row.min} to ${row.max}`,
      default: row.level,
    })),
    {
      columns: [
        { key: "format" },
        { key: "extension" },
        { key: "levels" },
        { key: "default", align: "right" },
      ],
    },
  );
}
