import type { Registry } from "./cli/define.ts";
import type { LoadedConfig } from "./config/loader.ts";
import type { ResolvedConfig } from "./config/schema.ts";
import type { Environment, OutputMode } from "./env.ts";
import type { Reporter } from "./output/reporter.ts";
import type { InStream, OutStream } from "./output/stream.ts";
import type { Prompter } from "./prompt/prompter.ts";

export type BtkIO = {
  stdin: InStream & NodeJS.ReadableStream;
  stdout: OutStream & NodeJS.WritableStream;
  stderr: OutStream & NodeJS.WritableStream;
};

export type BtkContext = {
  cwd: string;
  platform: NodeJS.Platform;
  arch: string;
  version: string;
  bunVersion: string;
  env: Record<string, string | undefined>;
  environment: Environment;
  outputMode: OutputMode;
  isInteractive: boolean;
  config: ResolvedConfig;
  configInfo: LoadedConfig;
  reporter: Reporter;
  prompter: Prompter;
  registry: Registry;
  io: BtkIO;
  /** Aborted on Ctrl+C. Long-running core functions should honor it. */
  signal: AbortSignal;
};
