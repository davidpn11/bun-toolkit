import { basename } from "node:path";
import { displayPath } from "../../config/loader.ts";
import type { BtkContext } from "../../context.ts";
import type { SummaryTone } from "../../output/components/summary.ts";
import { formatBytes, formatDimensions, formatDuration } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { Output } from "../../output/reporter.ts";
import type { ImageInfo, InfoReport } from "./info.ts";
import type { FileResult, OptimizeReport } from "./optimize.ts";
import { fileRow, type Tone } from "./present.ts";

export function renderOptimize(report: OptimizeReport, out: Output, ctx: BtkContext): void {
  const s = out.style;
  const shown = report.files.filter((file) => file.code !== "SKIP_PREVIOUS_OUTPUT");
  if (shown.length > 0) renderFiles(shown, out, ctx);
  renderProblems(report, out);
  out.text();
  out.summary(optimizeSummary(report), summaryTitle(report), summaryTone(report));
  const tip = savingsTip(report);
  if (tip) out.text(s.muted(tip));
}

function renderFiles(files: FileResult[], out: Output, ctx: BtkContext): void {
  const s = out.style;
  const paint = (key: "statusTone" | "changeTone") => (text: string, row: Record<string, unknown>) =>
    text ? s[row[key] as Tone](text) : text;
  out.table(
    files.map((file) => fileRow(file, ctx.cwd)),
    {
      columns: [
        { key: "status", label: "", paint: paint("statusTone") },
        { key: "file" },
        { key: "output", paint: (text) => s.muted(text) },
        { key: "size", align: "right" },
        { key: "change", align: "right", paint: paint("changeTone") },
        { key: "note", paint: (text, row) => (row.statusTone === "success" ? s.muted(text) : text) },
      ],
    },
  );
}

function renderProblems(report: OptimizeReport, out: Output): void {
  const s = out.style;
  const hints = [...new Set(report.files.map((f) => f.hint).filter((h): h is string => Boolean(h)))];
  const previous = report.files
    .filter((f) => f.code === "SKIP_PREVIOUS_OUTPUT")
    .map((f) => basename(f.input));
  const lines = [
    ...(previous.length > 0
      ? [
          s.muted(
            `Left alone ${previous.length} earlier ${previous.length === 1 ? "output" : "outputs"}: ${listNames(previous)}`,
          ),
        ]
      : []),
    ...report.missing.map((p) => `${s.warning(icons.warning)} Nothing matched ${p}`),
    ...report.ignored.map((p) => `${s.warning(icons.warning)} Skipped ${p}: not an image file`),
    ...hints.map((h) => s.muted(`${icons.arrow} ${h}`)),
  ];
  if (lines.length === 0) return;
  out.text();
  for (const line of lines) out.text(line);
}

function listNames(names: string[], max = 3): string {
  return names.length > max
    ? `${names.slice(0, max).join(", ")} and ${names.length - max} more`
    : names.join(", ");
}

function optimizeSummary(report: OptimizeReport): Record<string, string | number> {
  const { totals } = report;
  const stats: Record<string, string | number> = { converted: totals.converted };
  if (totals.skipped > 0) stats.skipped = totals.skipped;
  if (totals.failed > 0) stats.failed = totals.failed;
  if (totals.converted > 0) {
    stats[""] = `${formatBytes(totals.beforeBytes)} → ${formatBytes(totals.afterBytes)}`;
    stats.saved = `${formatBytes(totals.savedBytes)} (${totals.savedPercent.toFixed(1)}%)`;
  }
  stats.elapsed = formatDuration(report.durationMs);
  return stats;
}

function summaryTitle(report: OptimizeReport): string {
  if (report.cancelled) return "Cancelled";
  return report.options.dryRun ? "Dry run" : "Done";
}

function summaryTone(report: OptimizeReport): SummaryTone {
  const { converted, failed } = report.totals;
  if (failed > 0 && converted === 0) return "error";
  return failed > 0 || report.cancelled || report.missing.length > 0 ? "warning" : "success";
}

function savingsTip(report: OptimizeReport): string | undefined {
  const { totals, options } = report;
  if (totals.converted === 0 || totals.savedPercent >= 20 || options.maxWidth || options.maxHeight)
    return undefined;
  return "Tip: --preset web also shrinks images to 1920px wide, which usually saves far more.";
}

export function renderInfo(report: InfoReport, out: Output, ctx: BtkContext): void {
  const s = out.style;
  const [only] = report.images;
  if (report.images.length === 1 && only && report.failed.length === 0) {
    out.keyValue(infoPairs(only, ctx), basename(only.path));
  } else if (report.images.length > 0) {
    out.table(
      report.images.map((image) => ({
        file: displayPath(image.path, ctx.cwd),
        format: image.format,
        dimensions: formatDimensions(image.width, image.height),
        megapixels: image.megapixels,
        size: formatBytes(image.bytes),
      })),
      {
        columns: [
          { key: "file" },
          { key: "format" },
          { key: "dimensions" },
          { key: "megapixels", label: "MP", align: "right" },
          { key: "size", align: "right" },
        ],
      },
    );
  }
  for (const failure of report.failed) {
    out.text(`${s.error(icons.error)} ${displayPath(failure.path, ctx.cwd)}: ${failure.message}`);
  }
  for (const path of report.missing) out.text(`${s.warning(icons.warning)} Nothing matched ${path}`);
  if (report.images.length > 1) {
    const total = report.images.reduce((sum, image) => sum + image.bytes, 0);
    out.text();
    out.summary({ images: report.images.length, total: formatBytes(total) });
  }
}

function infoPairs(image: ImageInfo, ctx: BtkContext): Record<string, unknown> {
  return {
    path: displayPath(image.path, ctx.cwd),
    format: image.format,
    dimensions: formatDimensions(image.width, image.height),
    megapixels: image.megapixels,
    size: formatBytes(image.bytes),
    ...(image.placeholder && { placeholder: image.placeholder }),
  };
}
