import type { ComponentType } from "react";
import type { z } from "zod";
import type { BtkContext } from "../context.ts";
import type { ExitCode } from "../errors.ts";
import type { Output } from "../output/reporter.ts";
import type { ValueSource } from "./args.ts";

export type FlagOptions = {
  description: string;
  alias?: string;
  valueHint?: string;
  /** Key in `tools.<tool>` that supplies the default when the flag is not passed. */
  config?: string;
  hidden?: boolean;
};

export type FlagSpec<S extends z.ZodType = z.ZodType> = FlagOptions & {
  kind: "flag";
  schema: S;
};

export type PositionalOptions = {
  description: string;
  valueHint?: string;
};

export type PositionalSpec<S extends z.ZodType = z.ZodType> = PositionalOptions & {
  kind: "positional";
  schema: S;
};

export type ArgSpec = FlagSpec | PositionalSpec;
export type ArgsSpec = Record<string, ArgSpec>;
export type InferArgs<A extends ArgsSpec> = { [K in keyof A]: z.output<A[K]["schema"]> };

/** A `--flag`. The key in `args` becomes the kebab-case flag name (`maxWidth` -> `--max-width`). */
export function flag<S extends z.ZodType>(schema: S, options: FlagOptions): FlagSpec<S> {
  return { kind: "flag", schema, ...options };
}

/** A positional argument. An array schema makes it variadic (only valid as the last positional). */
export function positional<S extends z.ZodType>(schema: S, options: PositionalOptions): PositionalSpec<S> {
  return { kind: "positional", schema, ...options };
}

export type ActionMeta<A extends ArgsSpec = ArgsSpec> = {
  sources: Record<keyof A, ValueSource>;
};

export type ActionDef<A extends ArgsSpec = ArgsSpec, R = unknown> = {
  description: string;
  examples?: string[];
  aliases?: string[];
  hidden?: boolean;
  args?: A;
  /**
   * `false` for commands that must still run when the config is broken (`init`, `config validate`).
   * Every other command fails early with the config error.
   */
  requiresConfig?: boolean;
  projectConfig?: boolean;
  run(input: InferArgs<A>, ctx: BtkContext, meta: ActionMeta<A>): R | Promise<R>;
  render?(result: Awaited<R>, out: Output, ctx: BtkContext): void;
  exitCode?(result: Awaited<R>, ctx: BtkContext): ExitCode;
};

export type ToolScreenProps = {
  ctx: BtkContext;
  tool: ToolDef;
};

export type ToolScreen = ComponentType<ToolScreenProps>;
export type ToolScreenLoader = () => Promise<{ default: ToolScreen }>;

export type CommandDef<A extends ArgsSpec = ArgsSpec, R = unknown> = ActionDef<A, R> & {
  kind: "command";
  name: string;
};

export type ToolDef<C extends z.ZodObject = z.ZodObject, N extends string = string> = {
  kind: "tool";
  name: N;
  description: string;
  aliases?: string[];
  config?: C;
  actions: Record<string, ActionDef<any, any>>;
  /** Action used when the first argument is not an action name: `btk image a.png`. */
  defaultAction?: string;
  ui?: ToolScreenLoader;
  builtin?: boolean;
};

export type Entry = CommandDef | ToolDef;

export function defineAction<A extends ArgsSpec, R>(def: ActionDef<A, R>): ActionDef<A, R> {
  return def;
}

export function defineCommand<A extends ArgsSpec, R>(
  def: Omit<CommandDef<A, R>, "kind"> & { args?: A },
): CommandDef<A, R> {
  return { kind: "command", ...def } as CommandDef<A, R>;
}

export function defineTool<const N extends string, C extends z.ZodObject = z.ZodObject>(
  def: Omit<ToolDef<C, N>, "kind">,
): ToolDef<C, N> {
  if (def.defaultAction && !(def.defaultAction in def.actions)) {
    throw new Error(`Tool "${def.name}": defaultAction "${def.defaultAction}" is not one of its actions`);
  }
  return { kind: "tool", ...def };
}

export type Registry = {
  entries: readonly Entry[];
};

export function createRegistry(builtins: readonly Entry[], tools: readonly ToolDef[]): Registry {
  const entries = [...builtins, ...tools];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const name of [entry.name, ...(entry.aliases ?? [])]) {
      if (seen.has(name)) throw new Error(`Duplicate command name or alias: "${name}"`);
      seen.add(name);
    }
  }
  return { entries };
}

export function findEntry(registry: Registry, name: string): Entry | undefined {
  return registry.entries.find((e) => e.name === name || e.aliases?.includes(name));
}

export function findAction(tool: ToolDef, name: string): [string, ActionDef] | undefined {
  for (const [key, action] of Object.entries(tool.actions)) {
    if (key === name || action.aliases?.includes(name)) return [key, action];
  }
  return undefined;
}

export function registeredTools(registry: Registry): ToolDef[] {
  return registry.entries.filter((e): e is ToolDef => e.kind === "tool" && !e.builtin);
}
