/**
 * Plugin contract (docs/plugins.md). The loader and hooks arrive with the markdown tool;
 * for now the config accepts and validates plugin objects so the shape is stable.
 */
export type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

export type HookRegistry = {
  on(name: string, handler: (...args: unknown[]) => unknown): void;
};
