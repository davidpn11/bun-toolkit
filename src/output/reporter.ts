import type { OutputMode } from "../env.ts";
import { isBtkError } from "../errors.ts";
import { renderKeyValue } from "./components/key-value.ts";
import { renderList } from "./components/list.ts";
import { type LogLevel, renderLog } from "./components/log.ts";
import { renderNotice } from "./components/notice.ts";
import {
  createProgressBar,
  createStaticProgress,
  type Progress,
  silentProgress,
} from "./components/progress-bar.ts";
import {
  createAnimatedSpinner,
  createStaticSpinner,
  type Spinner,
  silentSpinner,
} from "./components/spinner.ts";
import { renderSummary, type SummaryTone } from "./components/summary.ts";
import { renderTable, type TableOptions } from "./components/table.ts";
import { icons } from "./palette.ts";
import type { OutStream } from "./stream.ts";
import { createStyler, type Styler } from "./style.ts";

type LogFn = (message: string) => void;

/**
 * Result output, written to stdout. Actions call these from `render()`; the reporter decides
 * whether that means styled columns, tab-separated text, or nothing (json mode).
 */
export type Output = {
  table(rows: Record<string, unknown>[], options?: TableOptions): void;
  keyValue(pairs: Record<string, unknown>, title?: string): void;
  list(items: string[], options?: { title?: string; ordered?: boolean }): void;
  notice(lines: string[]): void;
  summary(stats: Record<string, string | number>, title?: string, tone?: SummaryTone): void;
  text(line?: string): void;
  /** Styling for custom text. Colors are off whenever stdout is not a color terminal. */
  style: Styler;
};

export type Reporter = {
  mode: OutputMode;
  verbose: boolean;
  style: Styler;
  log: Record<LogLevel, LogFn>;
  spinner: Spinner;
  progress: Progress;
  out: Output;
  json(value: unknown): void;
  error(error: unknown): void;
};

export type ReporterOptions = {
  mode: OutputMode;
  stdout: OutStream;
  stderr: OutStream;
  /** Allow ANSI styling. Ignored outside human mode. */
  color?: boolean;
  verbose?: boolean;
};

export function createReporter(options: ReporterOptions): Reporter {
  const { mode, stdout, stderr } = options;
  const verbose = options.verbose ?? false;
  const human = mode === "human";
  const color = human && (options.color ?? true);
  const errStyle = createStyler(color && stderr.isTTY !== false);
  const outStyle = createStyler(color && stdout.isTTY === true);
  const plain = mode === "ci";

  const writeOut = (text: string) => stdout.write(`${text}\n`);
  const writeErr = (text: string) => stderr.write(`${text}\n`);

  const logAt =
    (level: LogLevel): LogFn =>
    (message) => {
      if (mode === "json") return;
      if (level === "debug" && !verbose) return;
      writeErr(renderLog(errStyle, level, message));
    };

  const silent = mode === "json";
  const out: Output = {
    style: outStyle,
    table: (rows, opts) => silent || writeOut(renderTable(outStyle, rows, { ...opts, plain })),
    keyValue: (pairs, title) => silent || writeOut(renderKeyValue(outStyle, pairs, { title, plain })),
    list: (items, opts) => silent || writeOut(renderList(outStyle, items, { ...opts, plain })),
    notice: (lines) => silent || writeOut(renderNotice(outStyle, lines, { plain })),
    summary: (stats, title, tone) =>
      silent || writeOut(renderSummary(outStyle, stats, { title, plain, tone })),
    text: (line = "") => silent || writeOut(line),
  };

  return {
    mode,
    verbose,
    style: errStyle,
    log: {
      error: logAt("error"),
      warn: logAt("warn"),
      info: logAt("info"),
      success: logAt("success"),
      debug: logAt("debug"),
    },
    spinner: human
      ? createAnimatedSpinner(errStyle, stderr)
      : plain
        ? createStaticSpinner(stderr)
        : silentSpinner,
    progress: human
      ? createProgressBar(errStyle, stderr)
      : plain
        ? createStaticProgress(stderr)
        : silentProgress,
    out,
    json(value) {
      stdout.write(`${JSON.stringify(value, jsonReplacer, 2)}\n`);
    },
    error(error) {
      if (mode === "json") {
        stdout.write(`${JSON.stringify({ ok: false, error: serializeError(error, verbose) }, null, 2)}\n`);
        return;
      }
      writeErr(formatError(errStyle, error, verbose));
    },
  };
}

export function formatError(s: Styler, error: unknown, verbose: boolean): string {
  const lines: string[] = [];
  if (isBtkError(error)) {
    lines.push(`${s.error(icons.error)} ${s.bold(error.message)}`);
    for (const detail of error.details) lines.push(`  ${detail}`);
    if (error.hint) lines.push(`  ${s.muted(`${icons.arrow} ${error.hint}`)}`);
    if (verbose && error.cause instanceof Error && error.cause.stack) lines.push(s.muted(error.cause.stack));
    return lines.join("\n");
  }
  const message = error instanceof Error ? error.message : String(error);
  lines.push(`${s.error(icons.error)} ${s.bold(`Unexpected error: ${message}`)}`);
  if (verbose && error instanceof Error && error.stack) {
    lines.push(s.muted(error.stack));
  } else {
    lines.push(`  ${s.muted(`${icons.arrow} Run again with --verbose to see the stack trace`)}`);
  }
  return lines.join("\n");
}

export function serializeError(error: unknown, verbose: boolean): Record<string, unknown> {
  if (isBtkError(error)) return error.toJSON();
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "ERR_UNEXPECTED",
    message,
    ...(verbose && error instanceof Error && { stack: error.stack }),
  };
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return undefined;
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}
