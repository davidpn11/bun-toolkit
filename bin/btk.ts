#!/usr/bin/env bun
import { run } from "../src/cli/main.ts";

const controller = new AbortController();

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
