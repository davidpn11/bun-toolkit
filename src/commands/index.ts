import type { Entry } from "../cli/define.ts";
import { completeWords, completion } from "./completion.ts";
import { config } from "./config.ts";
import { info } from "./info.ts";
import { init } from "./init.ts";
import { ui } from "./ui.ts";
import { update } from "./update.ts";

export const builtins: readonly Entry[] = [info, init, config, ui, update, completion, completeWords];
