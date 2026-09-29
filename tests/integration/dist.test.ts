import { describe, test } from "bun:test";
import { defineCliSuite } from "./cli-suite.ts";

// Runs the end-to-end suite against the compiled binary. `bun run test:dist` builds it and sets BTK_BIN.
if (process.env.BTK_BIN) {
  defineCliSuite(`binary ${process.env.BTK_BIN}`);
} else {
  describe("btk end-to-end (binary)", () => {
    test.skip("set BTK_BIN or run `bun run test:dist`", () => {});
  });
}
