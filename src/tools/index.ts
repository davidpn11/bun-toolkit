import type { ToolDef } from "../cli/define.ts";
import { compress, decompress } from "./compress/tool.ts";
import { convert } from "./convert/tool.ts";
import { hash } from "./hash/tool.ts";
import { image } from "./image/tool.ts";
import { password } from "./password/tool.ts";

export const tools = [
  image,
  hash,
  convert,
  password,
  compress,
  decompress,
] as const satisfies readonly ToolDef[];
