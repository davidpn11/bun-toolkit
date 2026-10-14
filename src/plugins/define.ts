import type { MdTheme } from "../tools/md/theme/types.ts";
import type { BtkPlugin } from "./types.ts";

/** Types a plugin factory: `plugins: [myPlugin({ ... })]`. */
export function definePlugin<A extends unknown[]>(
  factory: (...args: A) => BtkPlugin,
): (...args: A) => BtkPlugin {
  return factory;
}

/** Types a theme for `btk md`; btk validates it when a plugin hands it over. */
export function defineTheme(theme: MdTheme): MdTheme {
  return theme;
}
