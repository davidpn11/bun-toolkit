import type { OutStream } from "../stream.ts";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\r\x1b[2K";

let activeLines = 0;
let exitHookInstalled = false;

/**
 * One rewritable terminal line (spinner, progress bar). Restores the cursor if the
 * process exits while it is still drawing.
 */
export class LiveLine {
  #stream: OutStream;
  #drawn = false;

  constructor(stream: OutStream) {
    this.#stream = stream;
  }

  draw(text: string): void {
    if (!this.#drawn) {
      this.#drawn = true;
      activeLines++;
      this.#stream.write(HIDE_CURSOR);
      installExitHook(this.#stream);
    }
    const columns = this.#stream.columns ?? 80;
    this.#stream.write(CLEAR_LINE + truncate(text, columns - 1));
  }

  /** Clears the line and, if given, leaves a final message in its place. */
  finish(finalText?: string): void {
    if (!this.#drawn) {
      if (finalText) this.#stream.write(`${finalText}\n`);
      return;
    }
    this.#drawn = false;
    activeLines = Math.max(0, activeLines - 1);
    this.#stream.write(CLEAR_LINE + (finalText ? `${finalText}\n` : "") + SHOW_CURSOR);
  }
}

function installExitHook(stream: OutStream): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    if (activeLines > 0) stream.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
  });
}

function truncate(text: string, columns: number): string {
  if (Bun.stringWidth(text) <= columns) return text;
  // Drop characters from the end until it fits; ANSI codes stay balanced enough for a single line.
  let out = text;
  while (out.length > 0 && Bun.stringWidth(out) > columns - 1) out = out.slice(0, -1);
  return `${out}…\x1b[0m`;
}
