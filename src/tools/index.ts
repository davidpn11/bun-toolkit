import type { ToolDef } from "../cli/define.ts";
import { compress, decompress } from "./compress/tool.ts";
import { convert } from "./convert/tool.ts";
import { hash } from "./hash/tool.ts";
import { image } from "./image/tool.ts";
import { md } from "./md/tool.ts";
import { password } from "./password/tool.ts";
import { serve } from "./serve/tool.ts";

export const tools = [
  image,
  hash,
  convert,
  password,
  compress,
  decompress,
  md,
  serve,
] as const satisfies readonly ToolDef[];
