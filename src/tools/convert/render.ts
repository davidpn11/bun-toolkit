import { basename } from "node:path";
import { displayPath } from "../../config/loader.ts";
import type { BtkContext } from "../../context.ts";
import type { SummaryTone } from "../../output/components/summary.ts";
import { formatBytes } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { Output } from "../../output/reporter.ts";
import type { FileResult, WriteReport } from "./convert.ts";
import type { ConvertResult } from "./tool.ts";

export function renderConvert(result: ConvertResult, out: Output, ctx: BtkContext): void {
  if (result.mode === "stdout") {
    out.text(result.output.replace(/\n$/, ""));
    return;
  }
  const s = out.style;
  if (result.mode === "file") {
    const verb = result.dryRun ? "Would write" : "Wrote";
    out.text(
      `${s.success(icons.success)} ${verb} ${s.bold(displayPath(result.path, ctx.cwd))} ${s.muted(`(${formatBytes(result.bytes)})`)}`,
    );
    return;
  }
  renderBatch(result, out, ctx);
}

function renderBatch(report: WriteReport, out: Output, ctx: BtkContext): void {
  const s = out.style;
  const shown = report.files.filter((file) => file.code !== "SKIP_PREVIOUS_OUTPUT");
  const previous = report.files.filter((file) => file.code === "SKIP_PREVIOUS_OUTPUT").length;
  if (shown.length > 0) renderRows(shown, report.to, out, ctx);
  const hints = [...new Set(report.files.map((f) => f.hint).filter((h): h is string => Boolean(h)))];
  const notes = [
    ...(previous > 0
      ? [s.muted(`Left alone ${previous} earlier ${previous === 1 ? "output" : "outputs"}`)]
      : []),
    ...report.missing.map((p) => `${s.warning(icons.warning)} Nothing matched ${p}`),
    ...hints.map((h) => s.muted(`${icons.arrow} ${h}`)),
  ];
  if (notes.length > 0) out.text();
  for (const line of notes) out.text(line);
  out.text();
  out.summary(batchStats(report), report.dryRun ? "Dry run" : "Done", batchTone(report));
}

function renderRows(files: FileResult[], to: string, out: Output, ctx: BtkContext): void {
  const s = out.style;
  out.table(
    files.map((file) => batchRow(file, to, ctx)),
    {
      columns: [
        {
          key: "status",
          label: "",
          paint: (text, row) => paintStatus(s, row.state as FileResult["status"], text),
        },
        { key: "file" },
        { key: "output", paint: (text) => s.muted(text) },
        { key: "size", align: "right" },
        { key: "note" },
      ],
    },
  );
}

function batchRow(file: FileResult, to: string, ctx: BtkContext): Record<string, unknown> {
  const converted = file.status === "converted";
  return {
    state: file.status,
    status: converted ? icons.success : file.status === "failed" ? icons.error : "–",
    file: displayPath(file.input, ctx.cwd),
    output: converted && file.output ? basename(file.output) : "",
    size: converted ? formatBytes(file.bytes ?? 0) : "",
    note: converted ? `${file.from} → ${to}` : (file.reason ?? ""),
  };
}

function paintStatus(s: Output["style"], status: FileResult["status"], text: string): string {
  if (status === "converted") return s.success(text);
  return status === "failed" ? s.error(text) : s.muted(text);
}

function batchStats(report: WriteReport): Record<string, number> {
  const stats: Record<string, number> = { converted: report.totals.converted };
  if (report.totals.skipped > 0) stats.skipped = report.totals.skipped;
  if (report.totals.failed > 0) stats.failed = report.totals.failed;
  return stats;
}

function batchTone(report: WriteReport): SummaryTone {
  const { converted, failed } = report.totals;
  if (failed > 0 && converted === 0) return "error";
  return failed > 0 || report.missing.length > 0 ? "warning" : "success";
}

type FormatRow = { name: string; read: boolean; write: boolean; extensions: string[] };

export function renderFormats(rows: FormatRow[], out: Output): void {
  const s = out.style;
  const mark = (value: boolean) => (value ? icons.success : "");
  out.table(
    rows.map((row) => ({
      format: row.name,
      read: mark(row.read),
      write: mark(row.write),
      extensions: row.extensions.join(" "),
    })),
    {
      columns: [
        { key: "format" },
        { key: "read", paint: (text) => s.success(text) },
        { key: "write", paint: (text) => s.success(text) },
        { key: "extensions", paint: (text) => s.muted(text) },
      ],
    },
  );
}
