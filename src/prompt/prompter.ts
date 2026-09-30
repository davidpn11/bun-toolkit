import { BtkError, ExitCode } from "../errors.ts";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

/**
 * Interactive prompts behind an interface, so the backing library (@clack/prompts today) can be
 * swapped without touching commands. Every method throws when the session is not interactive.
 */
export type Prompter = {
  readonly interactive: boolean;
  confirm(message: string, options?: { initial?: boolean }): Promise<boolean>;
  select<T extends string>(message: string, options: SelectOption<T>[]): Promise<T>;
  text(message: string, options?: { placeholder?: string; initial?: string }): Promise<string>;
  /**
   * Hidden input drawn on stderr, so it works while stdout is redirected (`btk password hash > h.txt`).
   * Needs only a terminal on stdin and stderr.
   */
  secret(message: string): Promise<string>;
  readonly canAskSecret: boolean;
};

export type PrompterOptions = { interactive: boolean; canAskSecret: boolean };

export function notInteractive(message: string, hint: string): BtkError {
  return new BtkError(message, { code: "ERR_NOT_INTERACTIVE", hint });
}

function cancelled(): BtkError {
  return new BtkError("Cancelled", { code: "ERR_CANCELLED", exitCode: ExitCode.Cancelled });
}

export function createPrompter({ interactive, canAskSecret }: PrompterOptions): Prompter {
  const guard = (message: string) => {
    if (!interactive) {
      throw notInteractive(
        `Cannot ask "${message}" in a non-interactive session`,
        "Pass the answer as a flag, or run in a terminal without --json / CI",
      );
    }
  };

  return {
    interactive,
    canAskSecret,
    async secret(message) {
      if (!canAskSecret) {
        throw notInteractive(
          `Cannot ask "${message}" without a terminal`,
          "Pipe the value in on standard input",
        );
      }
      const clack = await import("@clack/prompts");
      const answer = await clack.password({ message, output: process.stderr });
      if (clack.isCancel(answer)) throw cancelled();
      return answer;
    },
    async confirm(message, options = {}) {
      guard(message);
      const clack = await import("@clack/prompts");
      const answer = await clack.confirm({ message, initialValue: options.initial ?? false });
      if (clack.isCancel(answer)) throw cancelled();
      return answer;
    },
    async select(message, options) {
      guard(message);
      const clack = await import("@clack/prompts");
      const answer = await clack.select({ message, options: options as any });
      if (clack.isCancel(answer)) throw cancelled();
      return answer as (typeof options)[number]["value"];
    },
    async text(message, options = {}) {
      guard(message);
      const clack = await import("@clack/prompts");
      const answer = await clack.text({
        message,
        placeholder: options.placeholder,
        initialValue: options.initial,
      });
      if (clack.isCancel(answer)) throw cancelled();
      return answer;
    },
  };
}
