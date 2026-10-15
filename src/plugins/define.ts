import type { MdTheme } from "../tools/md/theme/types.ts";
import type { BtkPlugin } from "./types.ts";

export function definePlugin<A extends unknown[]>(
  factory: (...args: A) => BtkPlugin,
): (...args: A) => BtkPlugin {
  return factory;
}

export function defineTheme(theme: MdTheme): MdTheme {
  return theme;
}
