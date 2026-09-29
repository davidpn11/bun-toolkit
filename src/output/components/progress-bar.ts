import { formatDuration } from "../format.ts";
import { icons } from "../palette.ts";
import type { OutStream } from "../stream.ts";
import type { Styler } from "../style.ts";
import { LiveLine } from "./live-line.ts";

export type Progress = {
  start(total: number, label: string): void;
  /** Advance by `n` (default 1). `detail` replaces the trailing text, e.g. the current file. */
  tick(n?: number, detail?: string): void;
  done(message?: string): void;
  /** Clears the bar without a completion message, e.g. when the command fails. */
  stop(): void;
};

export type ProgressState = {
  current: number;
  total: number;
  label: string;
  detail: string;
  startedAt: number;
};

export function renderProgressBar(s: Styler, state: ProgressState, now: number, width = 24): string {
  const ratio = state.total > 0 ? Math.min(1, state.current / state.total) : 0;
  const filled = Math.round(ratio * width);
  const bar = s.accent("█".repeat(filled)) + s.muted("░".repeat(width - filled));
  const elapsed = now - state.startedAt;
  const eta = state.current > 0 && ratio < 1 ? (elapsed / state.current) * (state.total - state.current) : 0;
  const timing = ratio < 1 && eta > 0 ? s.muted(` eta ${formatDuration(eta)}`) : "";
  const detail = state.detail ? s.muted(` ${state.detail}`) : "";
  return `${state.label} ${bar} ${state.current}/${state.total}${timing}${detail}`;
}

export function createProgressBar(s: Styler, stream: OutStream, now: () => number = Date.now): Progress {
  const line = new LiveLine(stream);
  const state: ProgressState = { current: 0, total: 0, label: "", detail: "", startedAt: 0 };
  return {
    start(total, label) {
      Object.assign(state, { current: 0, total, label, detail: "", startedAt: now() });
      line.draw(renderProgressBar(s, state, now()));
    },
    tick(n = 1, detail) {
      state.current += n;
      if (detail !== undefined) state.detail = detail;
      line.draw(renderProgressBar(s, state, now()));
    },
    done(message) {
      const elapsed = formatDuration(now() - state.startedAt);
      line.finish(`${s.success(icons.success)} ${message ?? state.label} ${s.muted(`(${elapsed})`)}`);
    },
    stop() {
      line.finish();
    },
  };
}

/** CI mode: start and end lines only, so logs stay readable. */
export function createStaticProgress(stream: OutStream, now: () => number = Date.now): Progress {
  let label = "";
  let total = 0;
  let current = 0;
  let startedAt = 0;
  return {
    start(t, l) {
      total = t;
      label = l;
      current = 0;
      startedAt = now();
      stream.write(`… ${label} (0/${total})\n`);
    },
    tick(n = 1) {
      current += n;
    },
    done(message) {
      stream.write(`✔ ${message ?? label} (${current}/${total}, ${formatDuration(now() - startedAt)})\n`);
    },
    stop() {},
  };
}

export const silentProgress: Progress = {
  start() {},
  tick() {},
  done() {},
  stop() {},
};
