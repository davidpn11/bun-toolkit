import { fstatSync, statSync } from "node:fs";
import type { BtkIO } from "../context.ts";

export const STDIN = "-";

export function hasPipedStdin(io: BtkIO): boolean {
  return io.stdin.isTTY !== true;
}

export async function readStdin(io: BtkIO): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of io.stdin as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export function isStdoutFile(io: BtkIO, path: string): boolean {
  if (io.stdout !== process.stdout) return false;
  try {
    const out = fstatSync(1);
    if (!out.isFile()) return false;
    const file = statSync(path);
    return file.ino === out.ino && file.dev === out.dev;
  } catch {
    return false;
  }
}
