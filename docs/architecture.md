# Architecture

Why things are this way is in the [architecture decision records](adr/README.md).

## Command framework

The first plan used citty for routing. We dropped it in Phase 0 because citty 0.2 takes only single-value positionals, has no repeated flags, silently ignores unknown flags, and prints its own errors and help. Typo suggestions, validated values, variadic paths and config-sourced defaults would all have meant working around it.

The replacement lives in `src/cli/` (about 600 lines). `defineTool()` and `defineCommand()` descriptors drive it, and every argument is a zod schema. One descriptor produces:

- routing for `btk <tool> <action>`, aliases, and a default action (`btk image a.png` runs `btk image optimize a.png`)
- argument parsing for long and short flags, `-abc` clusters, `--no-x`, `--x=y`, repeated array flags and `--`
- validation with readable errors and "did you mean" suggestions, exiting with code 2
- help text with usage, arguments, choices, examples, and each default along with the config file that set it
- the `tools.<name>` config slice, its `defineConfig` types and its `BTK_<TOOL>_<KEY>` env vars
- the `--ui` flag and the tool's entry on the `btk ui` home screen
- TUI option forms, which `fieldsFromArgs` builds from the same flag specs

## Project structure

```
bin/btk.ts                    Entrypoint. Turns SIGINT into an AbortSignal, calls run(), sets the exit code. No top-level await.
src/
  cli/
    main.ts                   run(argv), the only error boundary. Route, config, context, action, output.
    define.ts                 defineTool, defineAction, defineCommand, flag, positional, Registry
    router.ts                 Maps argv to a route: root help, version, tool help, tool UI or action
    args.ts                   Token parser, per-argument zod validation, config fallback for flags
    schema-info.ts            Reads zod schemas: kind, enum values, bounds, defaults
    help.ts                   Help renderer
    suggest.ts                Edit distance for "did you mean"
    global-args.ts            --json, --verbose, --no-color, --config, --help and --ui
  commands/                   Built-ins: info, init, config (show, validate, path), ui, update
  tools/
    index.ts                  The tool registry
    image/                    btk image (docs/tools/image.md)
    hash/                     btk hash (docs/tools/hash.md)
    convert/                  btk convert (docs/tools/convert.md)
    password/                 btk password (docs/tools/password.md)
    compress/                 btk compress and btk decompress (docs/tools/compress.md)
    md/                       btk md (docs/tools/md.md): themes, terminal renderer, HTML page, folder preview
    serve/                    btk serve (docs/tools/serve.md): static files, listings, SPA fallback, network URLs
  config/
    schema.ts                 BtkConfig types, derived from the registry, and the runtime schemas
    loader.ts                 Discovery, import or JSON parse, per-file validation, merge, source tracking
    env.ts                    BTK_* env layer
    local-config.ts           The noLocalConfig warning or error for tool commands
    merge.ts                  Layered deep merge that records each key's source
    format-issues.ts          Turns zod issues into "path  message" lines with suggestions
    paths.ts                  Global dir and walk-up project discovery
    virtual-module.ts         Serves `import { defineConfig, definePlugin, defineTheme } from "bun-toolkit"` at runtime
    define.ts                 defineConfig()
  context.ts                  BtkContext
  env.ts                      Output mode detection
  errors.ts                   BtkError, UsageError, ConfigError and exit codes
  output/
    reporter.ts               Reporter and Output for each mode (human, ci, json)
    style.ts                  Styler (semantic colors through ansis) and visible-width helpers
    palette.ts                Bun accent color, terminal color names and icons, for the CLI and the TUI
    format.ts                 Bytes, durations, percentages, dimensions
    components/               log, table, key-value, list, notice, summary, spinner, progress-bar
  prompt/prompter.ts          @clack/prompts behind a Prompter type; throws when not interactive. secret() asks
                              for hidden input on stderr, so it works while stdout is redirected
  tui/
    launch.ts                 TTY check, then a lazy import of the runtime, so plain commands never load Ink
    runtime.tsx               Alternate screen, Ink render, terminal restore on every exit path
    app.tsx                   Providers, global keys (q, esc, ?, ctrl+c), help overlay
    navigation.tsx            Screen stack, breadcrumbs, input lock for text fields, active-screen flag
    components/               Screen, SelectList, FileBrowser, OptionsForm, ProgressList, ResultTable, ...
    screens/                  Home, Info, Config, ToolHost (loads a tool's lazy `ui`)
    index.ts                  What tool dashboards import
  shared/
    collect.ts                Turns file, folder and glob arguments into a sorted, de-duplicated file list
    fs.ts                     Directory listing for pickers, atomic writes, file error messages
    pool.ts                   Runs async work with a concurrency limit
    serve.ts                  Local HTTP server with live reload, path and Host checks; used by btk md and btk serve
    stdio.ts                  Reads piped stdin; detects when stdout is redirected into an input file
  plugins/
    types.ts                  BtkPlugin and HookMap, the list of hooks (docs/plugins.md)
    loader.ts                 Builds ctx.hooks from config.plugins; runs setup() on the first hook call
    define.ts                 definePlugin() and defineTheme()
  public.ts                   Package export: defineConfig, definePlugin, defineTheme and types
tests/
  support/                    Streams, temp projects, in-process and spawned CLI runners, test context,
                              Ink and dashboard helpers, image fixtures, and the test-only `demo` tool
  integration/                cli-suite.ts (shared), cli.test.ts (source), dist.test.ts (binary),
                              registry.test.ts (what a tool gets from defineTool), one file per tool
scripts/build.ts              Compiles the binary for this platform or a --target
scripts/test-dist.ts          Builds, then runs the end-to-end suite against the binary
```

## The tool contract

```
src/tools/<name>/
  core logic       Pure functions. Typed input, typed result. Takes { signal, onProgress }. No CLI or TUI imports.
  tool.ts          defineTool({ name, description, config, actions, defaultAction?, ui? })
  ui/Dashboard.tsx Optional. The default export receives { ctx, tool }.
  <name>.test.ts   Tests for the core logic.
```

Each shipped tool splits its core logic by job instead of using one `core.ts`. `btk image` has `optimize.ts`, `info.ts` and `presets.ts`, `btk hash` has `digest.ts`, `compute.ts` and `verify.ts`, and `btk convert` has `codec.ts` and `convert.ts`. Either layout works.

Tools share three building blocks from `src/shared/`. `collectFiles()` turns arguments into files with an `accept` filter and an `exclude` list. `runPool()` limits concurrency. `readStdin()` and `STDIN` (`-`) handle piped input, and tests feed it through `runBtk(args, { stdin })`.

A command whose result is data, like `btk hash`, `btk convert` and `btk password hash`, writes only that data to stdout and sends headers, progress and summaries to stderr through `ctx.reporter.log`. That keeps `btk hash … > SUMS` and `btk convert … | jq` clean. Binary data, such as `btk compress` output, goes through `out.raw()`, which writes bytes without a trailing newline. When the reader of a pipe exits early, as in `btk md CHANGELOG.md --terminal | head`, btk stops writing and exits 0 without an error. That keeps `set -o pipefail` scripts from failing because `head` stopped on purpose. `bin/btk.ts` handles the `error` event the write produces, and `run()` handles an EPIPE thrown directly.

`btk compress` and `btk decompress` are two tools in the registry that share one folder. `decompress` has no config slice of its own.

- `action.run(input, ctx, meta)` calls the core logic and returns data. In json mode the runner prints that data inside the envelope.
- `meta.sources` says where each value came from (`flag`, `argument`, `config` or `default`). `btk image` uses it so an explicit flag beats a preset while a config value does not.
- `action.render(result, out, ctx)` presents the data in human and ci mode with `out.table()`, `out.keyValue()`, `out.summary()` and so on. It never checks the output mode.
- `action.exitCode(result, ctx)` is optional. It lets a command print a full report and still exit non-zero, for example when some files in a batch failed. In json mode the envelope's `ok` follows it.
- Progress goes through `ctx.reporter.spinner` and `ctx.reporter.progress`. Each mode makes them animated, static or silent.
- The dashboard calls the same core functions and builds its screens from `src/tui/index.ts`.
- A flag that declares `config: "<key>"` falls back to `tools.<name>.<key>`, which gives it the full flag, env, project, global, default chain.

Adding the tool to `src/tools/index.ts` is the only wiring.

### Adding a tool

A tool is one folder plus one line in `src/tools/index.ts`:

```ts
// src/tools/hash/tool.ts
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import { hashFiles } from "./core.ts";

export const hash = defineTool({
  name: "hash",
  description: "Hash files with Bun.CryptoHasher",
  config: z.object({ algorithm: z.enum(["sha256", "sha512", "blake2b256"]).default("sha256") }),
  defaultAction: "file",
  actions: {
    file: defineAction({
      description: "Hash one or more files",
      examples: ["btk hash package.tar.gz --algorithm sha512"],
      args: {
        files: positional(z.array(z.string()).min(1), { description: "Files to hash" }),
        algorithm: flag(z.enum(["sha256", "sha512", "blake2b256"]), {
          alias: "a",
          config: "algorithm",
          description: "Hash algorithm",
        }),
      },
      run: (input, ctx) => hashFiles(input, { signal: ctx.signal }),
      render: (result, out) => out.table(result.rows),
    }),
  },
  ui: () => import("./ui/Dashboard.tsx"), // optional: enables `btk hash --ui`
});
```

That single definition gives you:
- `btk hash ...` routing, plus `btk hash file ...`
- help text with defaults and where they came from
- validated, typo-checked flags
- `tools.hash` in the config schema and in `defineConfig` types
- the `BTK_HASH_ALGORITHM` env var
- JSON output and the `btk ui` home screen entry

Tool dashboards use the components exported from `src/tui/index.ts`, such as `Screen`, `FileBrowser`, `ProgressList`, `ResultTable`, and `OptionsForm`, which builds a form from the same flag specs.

## Execution lifecycle

```
bin/btk.ts
  run(argv)                   src/cli/main.ts
    detectEnvironment()       Preliminary mode from flags, env and TTY, so early errors render in the right style
    resolveRoute()            An unknown command throws UsageError (exit 2) with a suggestion
    --version, --help         Answered without loading config
    loadConfig()              Never throws; problems go into configInfo.error
    detectEnvironment()       Final mode, now including config output.* preferences
    build BtkContext          Config, reporter, prompter, registry, io, signal
    tool help, --ui           --ui calls launchTui(), which exits 2 without a terminal
    requiresConfig            Throws configInfo.error (exit 78) unless the command opts out
    parseArgs()               Throws UsageError (exit 2) on bad input
    action.run()              Then the json envelope or action.render(), then action.exitCode()
  exit code                   The boundary prints any error once, in the current mode
```

## BtkContext

```typescript
type BtkContext = {
  cwd: string;
  platform: NodeJS.Platform;
  arch: string;
  version: string;
  bunVersion: string;
  env: Record<string, string | undefined>;
  environment: Environment;      // mode, color, interactive, verbose, reason
  outputMode: "human" | "ci" | "json";
  isInteractive: boolean;
  config: ResolvedConfig;        // merged, defaults applied
  configInfo: LoadedConfig;      // files, per-key sources, validation error
  reporter: Reporter;
  prompter: Prompter;
  registry: Registry;
  io: BtkIO;                     // injectable stdin, stdout, stderr (tests)
  signal: AbortSignal;           // aborted on Ctrl+C
};
```

## Error handling

`run()` is the only place that catches. A `BtkError`, `UsageError` or `ConfigError` prints its message, details and hint, then exits with its own code. Any other error prints as "Unexpected error" with a hint to rerun with `--verbose` for the stack. In json mode an error is a `{ "ok": false, "error": {...} }` document on stdout.

## TUI navigation

Every screen in the stack stays mounted. Only the top one is visible, and `useScreenActive()` tells input components (SelectList, FileBrowser, OptionsForm) whether their screen is on top, so hidden screens ignore keys. Going back returns to a screen exactly as the user left it, with the same folder, cursor and selection. `nav.popTo(id)` returns to a screen further down the stack, which the image dashboard uses after a run.

## Dependencies

| Role | Library | Notes |
|------|---------|-------|
| Validation | zod 4 | Config files, env vars, flags and TUI forms share schemas |
| Colors and styling | ansis | Behind `Styler`; off in ci and json mode |
| Interactive prompts | @clack/prompts (pinned) | Behind `Prompter`; loaded lazily |
| TUI | Ink 6 + React 19 | Loaded lazily, only for `--ui` and `btk ui` |

The spinner and progress bar are ours (`src/output/components/`). They write to injectable streams, use the shared palette and restore the cursor on exit. We dropped nanospinner.
