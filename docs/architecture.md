# Architecture

## CLI framework: citty

citty is a 3KB, zero-dependency, TypeScript-first command router from the UnJS ecosystem (Nuxt, Nitro). It supports nested subcommands, auto-generates help text, and infers argument types from definitions.

Why citty over alternatives:
- @stricli/core couples commands to a context-building pattern. Unnecessary here.
- Commander.js is Node-centric and string-template-based.
- Boune bundles too many concerns (colors, spinners, arg parsing in one package).
- Hand-rolling command parsing leads to reimplementing help text, type coercion, and subcommand routing.

citty handles routing. Everything else (output, config, context) is ours.

## Project structure

```
bun-toolkit/
  bin/
    btk.ts                    # CLI entrypoint (compiled target)
  src/
    cli.ts                    # citty app, subcommand registration
    config/
      loader.ts               # Discovers and loads global + project config
      schema.ts               # BtkConfig type definition and defaults
      define.ts               # defineConfig() identity function
    context.ts                # BtkContext type (config, reporter, prompter)
    env.ts                    # Environment detection (CI, agent, TTY, NO_COLOR)
    output/
      reporter.ts             # Output dispatcher (human / json / ci)
      formatter.ts            # ANSI styling via ansis, icon set
      components/
        log.ts                # error/warn/info/success lines
        table.ts              # Aligned columns
        key-value.ts          # Key-value pair lists
        list.ts               # Bulleted lists
        notice.ts             # Boxed messages
        spinner.ts            # Progress spinner
        progress-bar.ts       # File processing progress
        summary.ts            # End-of-command summary
      themes/
        default.ts            # Brand palette and icons
    prompt/
      prompter.ts             # Wraps @clack/prompts, throws in non-interactive
      guards.ts               # isInteractive(), requireInteractive()
    plugins/
      loader.ts               # Plugin discovery and registration
      types.ts                # Plugin interface definition
    tools/
      image/
        command.ts            # citty command (parses args, calls core, pipes to reporter)
        core.ts               # Pure logic: optimize, info
        image.test.ts
      hash/
        command.ts
        core.ts
        hash.test.ts
      convert/
        command.ts
        core.ts
        convert.test.ts
      ... (one directory per tool)
    tui/
      app.tsx                 # Ink/React TUI entry (Phase 7)
      components/             # TUI-specific React components
    shared/
      fs.ts                   # File helpers (glob, walk, size formatting)
      timing.ts               # Duration measurement
      errors.ts               # BtkError base class
      version.ts              # Version introspection
  tests/
    support/
      streams.ts              # PassThrough helpers for output capture
      fixtures/               # Test images, text files, config samples
      context.ts              # Test context builder
    integration/
      cli.test.ts             # End-to-end CLI tests against source
      dist.test.ts            # Same tests against compiled binary
  scripts/
    build.ts                  # Cross-compilation orchestrator
    package-npm.ts            # Generates dist/ with platform packages
    test-dist.ts              # Builds for current platform, runs dist.test.ts
    update-homebrew.ts        # Updates Homebrew formula
  dist/                       # Generated: npm packages and binaries
  package.json
  tsconfig.json
  bunfig.toml
  LICENSE
  README.md
  CHANGELOG.md
  ROADMAP.md
```

## The tool contract

Every tool follows the same pattern:

1. `core.ts` contains the pure logic. Accepts typed input, returns typed output. No CLI dependencies, no reporter calls.
2. `command.ts` defines the citty command. Parses args, merges config defaults, calls the function from `core.ts`, sends the result through the reporter.
3. Tests cover the core function directly. Integration tests cover CLI behavior separately.

This separation means tools are testable without simulating CLI invocations, and the TUI can call the same core functions without going through arg parsing.

## Execution lifecycle

```
bin/btk.ts
  -> detect environment (env.ts)
  -> load config (config/loader.ts): global + project, merged
  -> build context (context.ts): config, reporter, prompter
  -> citty routes to the correct command
  -> command.ts: parse tool-specific args, merge with config defaults
  -> command.ts: call core function from core.ts with typed input
  -> command.ts: pipe result through reporter
  -> exit with code 0 (or 1 on error)
```

## BtkContext

Each command receives a context object:

```typescript
interface BtkContext {
  cwd: string;
  platform: string;
  arch: string;
  version: string;
  config: ResolvedBtkConfig;
  reporter: Reporter;
  prompter: Prompter;
  isInteractive: boolean;
  outputMode: "human" | "json" | "ci";
}
```

## Error handling

A top-level try/catch in each command adapter distinguishes between `BtkError` (user-facing, print message and exit 1) and unexpected errors (print message, suggest `--verbose` for details).

## Dependencies

| Role | Library | Size | Notes |
|------|---------|------|-------|
| Command routing | citty | 3KB | TypeScript-first, zero-dep, UnJS ecosystem |
| Colors/styling | ansis | 3KB | Bun-compatible, correct multi-line ANSI handling |
| Spinner | nanospinner | 1KB | Degrades to plain text in non-TTY |
| Interactive prompts | @clack/prompts | ~15KB | Version-pinned, behind abstraction layer |
| TUI (Phase 7) | Ink 6 + React 19 | ~200KB | Used by Claude Code, Gemini CLI |
