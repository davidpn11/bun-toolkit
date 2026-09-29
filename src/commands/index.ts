import type { Entry } from "../cli/define.ts";
import { config } from "./config.ts";
import { info } from "./info.ts";
import { init } from "./init.ts";
import { ui } from "./ui.ts";

/** Built-in commands, in the order help lists them. Bun API tools live in src/tools/index.ts. */
export const builtins: readonly Entry[] = [info, init, config, ui];
