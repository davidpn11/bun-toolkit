import { plugin } from "bun";
import { definePlugin, defineTheme } from "../plugins/define.ts";
import { defineConfig } from "./define.ts";

let installed = false;

export function installConfigModule(): void {
  if (installed) return;
  installed = true;
  plugin({
    name: "bun-toolkit:config",
    setup(build) {
      build.module("bun-toolkit", () => ({
        exports: { defineConfig, definePlugin, defineTheme },
        loader: "object",
      }));
    },
  });
}
