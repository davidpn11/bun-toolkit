/**
 * Builds the binary for this platform and runs the end-to-end suite against it, catching problems
 * that only show up in compiled builds (missing modules, config loading, the virtual module).
 */
import { resolve } from "node:path";

const binary = resolve(`dist/btk${process.platform === "win32" ? ".exe" : ""}`);

const build = Bun.spawnSync([process.execPath, "scripts/build.ts", "--outfile", binary], {
  stdio: ["inherit", "inherit", "inherit"],
});
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

const test = Bun.spawnSync([process.execPath, "test", "tests/integration/dist.test.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, BTK_BIN: binary },
});
process.exit(test.exitCode ?? 1);
