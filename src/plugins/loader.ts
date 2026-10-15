import { BtkError } from "../errors.ts";
import type { BtkPlugin, HookInput, HookName, HookResult, Hooks } from "./types.ts";

type Registration = {
  plugin: string;
  name: string;
  handler: (input: unknown) => unknown;
};

type PluginLog = {
  warn(message: string): void;
};

/** Runs each plugin's `setup()` the first time a tool asks for a hook, so a broken plugin only breaks the tools that use plugins. */
export function createHooks(plugins: readonly BtkPlugin[], log: PluginLog): Hooks {
  let registrations: Registration[] | undefined;
  const handlersFor = (name: HookName) =>
    (registrations ??= setupAll(plugins, log)).filter((r) => r.name === name);

  return {
    collect<T extends HookName>(name: T, input: HookInput<T>): HookResult<T>[] {
      return handlersFor(name).map((r) => callHandler<T>(r, input));
    },
    last<T extends HookName>(name: T, input: HookInput<T>): HookResult<T> | undefined {
      const registration = handlersFor(name).at(-1);
      return registration && callHandler<T>(registration, input);
    },
  };
}

export const noHooks: Hooks = createHooks([], { warn: () => {} });

function setupAll(plugins: readonly BtkPlugin[], log: PluginLog): Registration[] {
  const registrations: Registration[] = [];
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.name)) log.warn(`Plugin "${plugin.name}" is listed twice; both copies run`);
    seen.add(plugin.name);
    runSetup(plugin, registrations);
  }
  return registrations;
}

function runSetup(plugin: BtkPlugin, registrations: Registration[]): void {
  try {
    plugin.setup({
      on: (name, handler) =>
        registrations.push({ plugin: plugin.name, name, handler: handler as Registration["handler"] }),
    });
  } catch (error) {
    throw pluginError(plugin.name, "setup()", error);
  }
}

function callHandler<T extends HookName>(registration: Registration, input: HookInput<T>): HookResult<T> {
  try {
    return { plugin: registration.plugin, value: registration.handler(input) as HookResult<T>["value"] };
  } catch (error) {
    throw pluginError(registration.plugin, `its "${registration.name}" hook`, error);
  }
}

function pluginError(plugin: string, where: string, error: unknown): BtkError {
  const reason = error instanceof Error ? error.message : String(error);
  return new BtkError(`Plugin "${plugin}" failed in ${where}: ${reason}`, {
    code: "ERR_PLUGIN",
    hint: "Check the plugin's version, or remove it from plugins in your config",
    cause: error,
  });
}
