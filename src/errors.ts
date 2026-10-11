export const ExitCode = {
  Ok: 0,
  Failure: 1,
  Usage: 2,
  /** EX_CONFIG from sysexits.h */
  Config: 78,
  /** 128 + SIGINT, what shells report for Ctrl+C */
  Cancelled: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export type BtkErrorOptions = {
  code?: string;
  hint?: string;
  details?: string[];
  exitCode?: ExitCode;
  cause?: unknown;
};

export class BtkError extends Error {
  readonly code: string;
  readonly hint: string | undefined;
  readonly details: string[];
  readonly exitCode: ExitCode;

  constructor(message: string, options: BtkErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "BtkError";
    this.code = options.code ?? "ERR_BTK";
    this.hint = options.hint;
    this.details = options.details ?? [];
    this.exitCode = options.exitCode ?? ExitCode.Failure;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details.length > 0 && { details: this.details }),
      ...(this.hint && { hint: this.hint }),
    };
  }
}

export class UsageError extends BtkError {
  constructor(message: string, options: Omit<BtkErrorOptions, "exitCode"> = {}) {
    super(message, { code: "ERR_USAGE", ...options, exitCode: ExitCode.Usage });
    this.name = "UsageError";
  }
}

export class ConfigError extends BtkError {
  constructor(message: string, options: Omit<BtkErrorOptions, "exitCode"> = {}) {
    super(message, { code: "ERR_CONFIG", ...options, exitCode: ExitCode.Config });
    this.name = "ConfigError";
  }
}

export function isBtkError(error: unknown): error is BtkError {
  return error instanceof BtkError;
}
