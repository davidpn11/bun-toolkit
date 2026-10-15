import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import type { Output } from "../../output/reporter.ts";
import { hostSchema, portSchema, type ServeConfig, serveConfig } from "./config.ts";
import { type ServeResult, servePath } from "./server.ts";

export const run = defineAction({
  description: "Serve a folder over HTTP, reloading the browser when files change",
  examples: [
    "btk serve",
    "btk serve dist --spa",
    "btk serve demo/index.html",
    "btk serve public --port 8080 --no-open",
    "btk serve site --host 0.0.0.0",
    "btk serve fixtures --cors",
  ],
  args: {
    path: positional(z.string().default("."), {
      valueHint: "path",
      description: "Folder to serve, or a file to open (its folder is served)",
    }),
    port: flag(portSchema, { alias: "p", config: "port", description: "Port; 0 picks a free one" }),
    host: flag(hostSchema, {
      config: "host",
      valueHint: "<address>",
      description: "Address to listen on; 0.0.0.0 shares it with your network",
    }),
    open: flag(z.boolean(), { config: "open", description: "Open the browser (--no-open prints the URL)" }),
    spa: flag(z.boolean(), {
      config: "spa",
      description: "Answer unknown routes with index.html, for single-page apps",
    }),
    cors: flag(z.boolean(), { config: "cors", description: "Allow requests from any origin" }),
  },
  run: (input, ctx): Promise<ServeResult> => servePath(input.path, input, ctx),
  render: renderServe,
});

export const serve = defineTool({
  name: "serve",
  description: "Serve a folder over HTTP with live reload",
  config: serveConfig,
  defaultAction: "run",
  actions: { run },
  ui: () => import("./ui/Dashboard.tsx"),
});

export function serveSettings(ctx: BtkContext): ServeConfig {
  return ctx.config.tools.serve as ServeConfig;
}

function renderServe(result: ServeResult, _out: Output, ctx: BtkContext): void {
  ctx.reporter.log.success(`Stopped serving ${result.root}`);
}
