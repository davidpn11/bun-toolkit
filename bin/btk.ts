#!/usr/bin/env bun
import { run } from "../src/cli/main.ts";
import { isBrokenPipe } from "../src/errors.ts";

const controller = new AbortController();

// A reader that exits early (`btk … | head`) surfaces as an `error` event, not a throw. Exit 0 as ripgrep
// does, so `set -o pipefail` scripts don't fail when a reader stops on purpose. Other errors still crash.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (!isBrokenPipe(error)) throw error;
    process.exit(0);
  });
}

process.once("SIGINT", () => {
  // Let the running command see the abort and clean up; force the exit if it does not.
  controller.abort();
  setTimeout(() => process.exit(130), 1000).unref();
});

// No top-level await: keeps the entrypoint compatible with every `bun build` output format.
run(process.argv.slice(2), { signal: controller.signal }).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
