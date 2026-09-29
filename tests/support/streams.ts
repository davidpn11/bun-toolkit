import { PassThrough } from "node:stream";

/**
 * A writable stream that records everything written to it. Pass `isTTY` to simulate a terminal.
 * It is a real PassThrough, so it also works where a Node stream is expected.
 */
export class CaptureStream extends PassThrough {
  isTTY: boolean;
  columns: number;
  rows: number;
  #chunks: string[] = [];

  constructor(options: { isTTY?: boolean; columns?: number } = {}) {
    super();
    this.isTTY = options.isTTY ?? false;
    this.columns = options.columns ?? 100;
    this.rows = 30;
  }

  override write(chunk: unknown, ...rest: unknown[]): boolean {
    this.#chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
    const callback = rest.find((r) => typeof r === "function") as (() => void) | undefined;
    callback?.();
    return true;
  }

  get text(): string {
    return this.#chunks.join("");
  }

  clear(): void {
    this.#chunks = [];
  }
}

export function createIO(options: { tty?: boolean } = {}) {
  const tty = options.tty ?? false;
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = tty;
  return {
    stdin,
    stdout: new CaptureStream({ isTTY: tty }),
    stderr: new CaptureStream({ isTTY: tty }),
  };
}

/** Matches any ANSI escape sequence (ESC + "["). */
export const ANSI = new RegExp(`${String.fromCharCode(27)}\\[`);
