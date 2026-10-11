export type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

export type HookRegistry = {
  on(name: string, handler: (...args: unknown[]) => unknown): void;
};
