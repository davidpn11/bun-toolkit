/**
 * Compiles btk into a standalone binary.
 *
 *   bun scripts/build.ts                                 # current platform -> dist/btk
 *   bun scripts/build.ts --target bun-linux-x64          # cross-compile
 *   bun scripts/build.ts --target bun-windows-x64 --outfile dist/btk-windows-x64.exe
 *
 * No `--bytecode`: Ink and yoga-layout use top-level await, which bytecode compilation rejects
 * (see docs/distribution.md).
 */
import { parseArgs } from "node:util";
import type { BunPlugin } from "bun";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    target: { type: "string" },
    outfile: { type: "string" },
  },
});

const target = values.target as Bun.Build.CompileTarget | undefined;
const isWindows = target ? target.includes("windows") : process.platform === "win32";
const outfile = values.outfile ?? `dist/btk${isWindows ? ".exe" : ""}`;

/** Ink imports react-devtools-core only when DEV=true; stub it so the bundle has no missing module. */
const stubDevtools: BunPlugin = {
  name: "stub-react-devtools",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "btk-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "btk-stub" }, () => ({
      contents: "export default { initialize() {}, connectToDevTools() {} };",
      loader: "js",
    }));
  },
};

const started = performance.now();
const result = await Bun.build({
  entrypoints: ["./bin/btk.ts"],
  compile: { outfile, ...(target && { target }) },
  minify: true,
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [stubDevtools],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const size = Bun.file(outfile).size;
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `Built ${outfile} (${(size / 1024 / 1024).toFixed(1)} MB) for ${target ?? "this platform"} in ${seconds}s`,
);
