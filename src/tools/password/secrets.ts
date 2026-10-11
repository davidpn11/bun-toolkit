import type { BtkContext } from "../../context.ts";
import { UsageError } from "../../errors.ts";
import { hasPipedStdin, readStdin } from "../../shared/stdio.ts";

export type PasswordSource = "argument" | "stdin" | "prompt";

export type Passwords = { values: string[]; source: PasswordSource };

export async function readPasswords(given: string[], ctx: BtkContext, confirm: boolean): Promise<Passwords> {
  if (given.length > 0) {
    if (ctx.outputMode === "human") {
      ctx.reporter.log.warn(
        "Passwords given as arguments stay in your shell history. Leave them out to type one at a hidden prompt.",
      );
    }
    return { values: given, source: "argument" };
  }
  if (hasPipedStdin(ctx.io)) return { values: await stdinLines(ctx), source: "stdin" };
  if (ctx.prompter.canAskSecret) return { values: [await ask(ctx, confirm)], source: "prompt" };
  throw new UsageError("No password given", {
    code: "ERR_NO_PASSWORD",
    hint: 'Run it in a terminal to type it at a hidden prompt, or pipe it in: echo "$PASSWORD" | btk password hash',
  });
}

async function stdinLines(ctx: BtkContext): Promise<string[]> {
  const text = new TextDecoder().decode(await readStdin(ctx.io));
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  if (lines.length === 0) {
    throw new UsageError("No password on standard input", {
      code: "ERR_NO_PASSWORD",
      hint: "Pipe one password per line",
    });
  }
  return lines;
}

async function ask(ctx: BtkContext, confirm: boolean): Promise<string> {
  const first = await ctx.prompter.secret("Password");
  if (!confirm) return first;
  const second = await ctx.prompter.secret("Repeat the password");
  if (first !== second)
    throw new UsageError("The two passwords don't match", { code: "ERR_PASSWORD_MISMATCH" });
  return first;
}
