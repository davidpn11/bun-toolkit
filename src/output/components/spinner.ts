import { icons } from "../palette.ts";
import type { OutStream } from "../stream.ts";
import type { Styler } from "../style.ts";
import { LiveLine } from "./live-line.ts";

export type Spinner = {
  start(message: string): void;
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  stop(): void;
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function createAnimatedSpinner(s: Styler, stream: OutStream, intervalMs = 80): Spinner {
  const line = new LiveLine(stream);
  let timer: ReturnType<typeof setInterval> | undefined;
  let frame = 0;
  let text = "";

  const draw = () => line.draw(`${s.accent(FRAMES[frame % FRAMES.length] ?? "")} ${text}`);
  const halt = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  return {
    start(message) {
      text = message;
      halt();
      frame = 0;
      draw();
      timer = setInterval(() => {
        frame++;
        draw();
      }, intervalMs);
      timer.unref?.();
    },
    update(message) {
      text = message;
      if (timer) draw();
    },
    succeed(message) {
      halt();
      line.finish(`${s.success(icons.success)} ${message ?? text}`);
    },
    fail(message) {
      halt();
      line.finish(`${s.error(icons.error)} ${message ?? text}`);
    },
    stop() {
      halt();
      line.finish();
    },
  };
}

/** CI mode: one static line when work starts and one when it ends. No animation. */
export function createStaticSpinner(stream: OutStream): Spinner {
  let text = "";
  let running = false;
  return {
    start(message) {
      text = message;
      running = true;
      stream.write(`… ${message}\n`);
    },
    update(message) {
      text = message;
    },
    succeed(message) {
      if (running) stream.write(`✔ ${message ?? text}\n`);
      running = false;
    },
    fail(message) {
      if (running) stream.write(`✖ ${message ?? text}\n`);
      running = false;
    },
    stop() {
      running = false;
    },
  };
}

export const silentSpinner: Spinner = {
  start() {},
  update() {},
  succeed() {},
  fail() {},
  stop() {},
};
