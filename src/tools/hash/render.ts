import { isAbsolute, relative } from "node:path";
import type { BtkContext } from "../../context.ts";
import { formatBytes, formatDuration, pluralize } from "../../output/format.ts";
import { icons } from "../../output/palette.ts";
import type { Output } from "../../output/reporter.ts";
import { STDIN } from "../../shared/stdio.ts";
import type { AlgorithmInfo } from "./algorithms.ts";
import type { HashReport } from "./compute.ts";
import type { CheckReport } from "./tool.ts";
import type { VerifyResult } from "./verify.ts";

/** Path as `sha256sum` prints it: relative to the working directory, without a leading `./`. */
export function sumsPath(file: string, cwd: string): string {
  if (file === STDIN) return STDIN;
  const rel = relative(cwd, file);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : file;
}

export function renderCompute(report: HashReport, out: Output, ctx: BtkContext): void {
  const s = out.style;
  for (const result of report.results) {
    if (result.status === "ok")
      out.text(`${s.accent(result.digest ?? "")}  ${sumsPath(result.file, ctx.cwd)}`);
  }
  const { log } = ctx.reporter;
  for (const result of report.results) {
    if (result.status === "failed") log.error(`${sumsPath(result.file, ctx.cwd)}: ${result.reason}`);
  }
  for (const path of report.missing) log.warn(`Nothing matched ${path}`);
  if (report.results.length > 1) {
    log.success(
      `${pluralize(report.totals.hashed, "input")} · ${formatBytes(report.totals.bytes)} · ${formatDuration(report.durationMs)}`,
    );
  }
}

export function renderVerify(result: VerifyResult, out: Output, ctx: BtkContext): void {
  const s = out.style;
  const file = sumsPath(result.file, ctx.cwd);
  const how = result.inferred ? `${result.algorithm}, guessed from the hash length` : result.algorithm;
  if (result.status === "match") {
    out.text(`${s.success(icons.success)} ${s.bold(file)} matches ${s.muted(`(${how})`)}`);
    return;
  }
  if (result.status === "failed") {
    out.text(`${s.error(icons.error)} ${s.bold(file)}: ${result.reason}`);
    return;
  }
  out.text(`${s.error(icons.error)} ${s.bold(file)} does not match ${s.muted(`(${how})`)}`);
  out.keyValue({ expected: result.expected, actual: result.actual ?? "" });
  if (result.inferred)
    out.text(s.muted(`${icons.arrow} If it was made with another algorithm, pass --algorithm`));
}

export function renderCheck(report: CheckReport, out: Output, ctx: BtkContext): void {
  const s = out.style;
  for (const result of report.results) {
    const file = sumsPath(result.file, ctx.cwd);
    if (result.status === "match") out.text(`${s.success(icons.success)} ${file}`);
    else if (result.status === "mismatch")
      out.text(`${s.error(icons.error)} ${file} ${s.error("does not match")}`);
    else out.text(`${s.error(icons.error)} ${file}: ${result.reason}`);
  }
  const { match, mismatch, failed } = report.totals;
  out.text();
  const stats: Record<string, number> = { matched: match };
  if (mismatch > 0) stats["did not match"] = mismatch;
  if (failed > 0) stats.unreadable = failed;
  out.summary(stats, "Checked", mismatch + failed > 0 ? "error" : "success");
}

export function renderAlgorithms(rows: (AlgorithmInfo & { default: boolean })[], out: Output): void {
  const s = out.style;
  out.table(
    rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      bits: row.bits,
      note: row.default ? "default" : "",
    })),
    {
      columns: [
        { key: "name", paint: (text, row) => (row.note ? s.accent(text) : text) },
        { key: "kind", paint: (text) => s.muted(text) },
        { key: "bits", align: "right" },
        { key: "note", label: "", paint: (text) => s.accent(text) },
      ],
    },
  );
  out.text();
  out.text(
    s.muted("Fast hashes are not secure against tampering. Use a cryptographic one to verify downloads."),
  );
}
