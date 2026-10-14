import type { MdTheme } from "../tools/md/theme/types.ts";

export type HtmlTemplateInput = {
  title: string;
  body: string;
  /** The theme's stylesheet plus `tools.md.css`. */
  css: string;
  /** A `<script>` that reloads the page on save; empty when writing a file. */
  liveReload: string;
  /** Sidebar links for `btk md serve`; empty for a single file. */
  nav: string;
};

export type HookMap = {
  /** Collect: every handler's themes become available to `--theme`. */
  "md:theme": { input: undefined; output: MdTheme | MdTheme[] };
  /** Replace: the last handler's page wins over the built-in one. */
  "md:html:template": { input: HtmlTemplateInput; output: string };
};

export type HookName = keyof HookMap;
export type HookInput<T extends HookName> = HookMap[T]["input"];
export type HookOutput<T extends HookName> = HookMap[T]["output"];
export type HookHandler<T extends HookName> = (input: HookInput<T>) => HookOutput<T>;

export type HookRegistry = {
  on<T extends HookName>(name: T, handler: HookHandler<T>): void;
};

export type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

export type HookResult<T extends HookName> = {
  plugin: string;
  value: HookOutput<T>;
};

export type Hooks = {
  /** Every handler's result, in registration order. */
  collect<T extends HookName>(name: T, input: HookInput<T>): HookResult<T>[];
  /** The last handler's result, or undefined when no plugin registered one. */
  last<T extends HookName>(name: T, input: HookInput<T>): HookResult<T> | undefined;
};
