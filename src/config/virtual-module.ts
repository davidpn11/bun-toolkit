import { plugin } from "bun";
import { defineConfig } from "./define.ts";

let installed = false;

/**
 * Serves `import { defineConfig } from "bun-toolkit"` from inside the running btk, so config files
 * load even when bun-toolkit is not in the project's node_modules (Homebrew, compiled binary,
 * global config). Works inside `bun build --compile` binaries.
 */
export function installConfigModule(): void {
  if (installed) return;
  installed = true;
  plugin({
    name: "bun-toolkit:config",
    setup(build) {
      build.module("bun-toolkit", () => ({ exports: { defineConfig }, loader: "object" }));
    },
  });
}
