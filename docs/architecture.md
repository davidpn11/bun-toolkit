# Architecture

## Command framework: our own, over a declarative tool descriptor

The first plan used citty for routing. We dropped it during Phase 0. citty 0.2 accepts only single-value positionals, has no repeated flags, ignores unknown flags silently, and prints its own errors and help. We would have been working around it for every "really good CLI" requirement: typo suggestions, validated values, variadic paths, defaults sourced from config, and our own help style.

The replacement is small (`src/cli/`, ~600 lines) and is driven entirely by `defineTool()` / `defineCommand()` descriptors whose arguments are **zod schemas**. One descriptor produces:

- routing: `btk <tool> <action>`, aliases, a default action (`btk image a.png` → `btk image optimize a.png`)
- argument parsing: long/short flags, `-abc` clusters, `--no-x`, `--x=y`, repeated array flags, `--`
- validation with readable errors and "did you mean" suggestions (exit code 2)
- help text: usage, arguments, options with choices and defaults (including which config file set them), examples
- the config schema slice `tools.<name>`, its `defineConfig` types, and `BTK_<TOOL>_<KEY>` env vars
- the `--ui` flag and the tool's entry on the `btk ui` home screen
- TUI option forms (`fieldsFromArgs`), generated from the same flag specs

## Project structure

```
bin/btk.ts                    Entrypoint: SIGINT -> AbortSignal, run(), exit code. No top-level await.
src/
  cli/
    main.ts                   run(argv): the only error boundary. Route -> config -> context -> action -> output
    define.ts                 defineTool / defineAction / defineCommand / flag / positional, Registry
    router.ts                 argv -> route (root help, version, tool help, tool ui, action)
    args.ts                   token parser + per-arg zod validation, config fallback for flags
    schema-info.ts            reads zod schemas: kind, enum values, bounds, defaults
    help.ts                   help renderer
    suggest.ts                edit distance "did you mean"
    global-args.ts            --json --verbose --no-color --config --help, and --ui
  commands/                   built-ins: info, init, config (show|validate|path), ui
  tools/index.ts              THE tool registry (empty until Phase 1)
  config/
    schema.ts                 BtkConfig types (derived from the registry) + runtime schemas
    loader.ts                 discovery, import, per-file validation, merge, source tracking
    env.ts                    BTK_* env layer
    merge.ts                  layered deep merge with per-key sources
    format-issues.ts          zod issues -> "path  message" lines with suggestions
    paths.ts                  global dir, walk-up project discovery
    virtual-module.ts         serves `import { defineConfig } from "bun-toolkit"` at runtime
    define.ts                 defineConfig()
  context.ts                  BtkContext
  env.ts                      output-mode detection
  errors.ts                   BtkError / UsageError / ConfigError, exit codes
  output/
    reporter.ts               Reporter + Output, per mode (human / ci / json)
    style.ts                  Styler (semantic colors via ansis), visible-width helpers
    palette.ts                Bun accent color, terminal color names and icons (CLI + TUI)
    format.ts                 bytes, durations, percentages, dimensions
    components/               log, table, key-value, list, notice, summary, spinner, progress-bar
  prompt/prompter.ts          @clack/prompts behind an interface; throws when not interactive
  tui/
    launch.ts                 TTY guard + lazy import of the runtime (Ink never loads for plain commands)
    runtime.tsx               alternate screen, Ink render, guaranteed terminal restore
    app.tsx                   providers, global keys (q, esc, ?, ctrl+c), help overlay
    navigation.tsx            screen stack, breadcrumbs, input lock for text fields
    components/               Screen, SelectList, FileBrowser, OptionsForm, ProgressList, ResultTable, ...
    screens/                  Home, Info, Config, ToolHost (loads a tool's lazy `ui`)
    index.ts                  what tool dashboards import
  shared/fs.ts                directory listing for pickers
  plugins/types.ts            BtkPlugin interface (loader arrives in Phase 6)
  public.ts                   package export: defineConfig + types
tests/
  support/                    streams, temp projects, in-process + spawned CLI runners, test context,
                              ink helpers, and the test-only `demo` tool
  integration/                cli-suite.ts (shared), cli.test.ts (source), dist.test.ts (binary),
                              registry.test.ts (what a tool gets for free)
scripts/build.ts              compile (current platform or --target)
scripts/test-dist.ts          build + run the end-to-end suite against the binary
```

## The tool contract

```
src/tools/<name>/
  core.ts          Pure logic. Typed input -> typed result. Accepts { signal, onProgress }. No CLI or TUI imports.
  tool.ts          defineTool({ name, description, config, actions, defaultAction?, ui? })
  ui/Dashboard.tsx Optional. Default-exported component receiving { ctx, tool }.
  <name>.test.ts   Tests for core.ts.
```

- `action.run(input, ctx)` calls `core.ts` and **returns data**. In json mode the runner prints it as `data` in the envelope.
- `action.render(result, out, ctx)` presents the data in human and ci mode, using `out.table()`, `out.keyValue()`, `out.summary()`... It never checks the output mode itself.
- Progress goes through `ctx.reporter.spinner` / `ctx.reporter.progress`, which are animated, static or silent depending on the mode.
- The dashboard calls the same `core.ts` functions and builds its screens from `src/tui/index.ts`.
- Flags declare `config: "<key>"` to fall back to `tools.<name>.<key>`, which gives each flag the full flag > env > project > global > default chain.

Registering the tool in `src/tools/index.ts` is the only wiring.

## Execution lifecycle

```
bin/btk.ts
  -> run(argv)                                   src/cli/main.ts
     -> detectEnvironment()   preliminary mode from flags/env/TTY, so early errors render correctly
     -> resolveRoute()        unknown command -> UsageError (2) with suggestion
     -> --version / --help    answered without loading config
     -> loadConfig()          never throws; problems are collected into configInfo.error
     -> detectEnvironment()   final mode, now including config output.* preferences
     -> build BtkContext      config, reporter, prompter, registry, io, signal
     -> tool help / --ui      --ui -> launchTui() (exit 2 without a terminal)
     -> requiresConfig?       throw configInfo.error (78) unless the command opts out
     -> parseArgs()           UsageError (2) on bad input
     -> action.run()          -> json envelope | action.render()
  <- exit code (errors are printed once, by the boundary, in the current mode)
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
  io: BtkIO;                     // injectable stdin/stdout/stderr (tests)
  signal: AbortSignal;           // aborted on Ctrl+C
};
```

## Error handling

`run()` is the only place that catches. `BtkError` (and `UsageError` / `ConfigError`) prints its message, details and hint, then exits with its own code. Anything else is printed as "Unexpected error" with a hint to use `--verbose` for the stack. In json mode, errors are a `{ "ok": false, "error": {...} }` document on stdout.

## Dependencies

| Role | Library | Notes |
|------|---------|-------|
| Validation | zod 4 | Config files, env vars, flags and TUI forms share schemas |
| Colors/styling | ansis | Behind `Styler`; off in ci/json |
| Interactive prompts | @clack/prompts (pinned) | Behind `Prompter`; loaded lazily |
| TUI | Ink 6 + React 19 | Loaded lazily, only for `--ui` / `btk ui` |

The spinner and progress bar are ours (`src/output/components/`): they write to injectable streams, use the shared palette, and restore the cursor on exit. nanospinner was dropped.
