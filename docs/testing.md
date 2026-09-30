# Testing

## Test runner

The tests use `bun:test`. `bun test` runs everything, and `bun run test:dist` builds the binary and runs the end-to-end suite against it.

## Layout

| Where | What |
|------|---------|
| `src/**/*.test.ts(x)` | Unit tests next to the code: env detection, formatters, reporter modes, components, arg parser, router, schema introspection, config loader, TUI components and app, and each tool's core logic and dashboard |
| `tests/integration/cli-suite.ts` | End-to-end suite that spawns btk. `cli.test.ts` runs it against the source and `dist.test.ts` against the compiled binary (`BTK_BIN`) |
| `tests/integration/registry.test.ts` | What a tool gets from `defineTool()`, checked in-process with the test-only `demo` tool |
| `tests/integration/<tool>.test.ts` | One file per tool, running the real CLI in-process |
| `tests/support/` | Helpers, listed below |

## Test support

| File | Purpose |
|------|---------|
| `streams.ts` | `CaptureStream`, a PassThrough that records output and can pretend to be a TTY; `createIO()`; the `ANSI` matcher |
| `tmp.ts` | `createTempProject()` makes a temp project with its own global config dir (`BTK_CONFIG_DIR`), so tests never read the real `~/.bun-toolkit`. `emptyDir()` is the default working directory, so no `btk.config.ts` in the repo or its parents leaks in |
| `cli.ts` | `runBtk()` runs the CLI in-process with captured streams, and `spawnBtk()` spawns the source or `BTK_BIN`. Both take `stdin` to pipe text in |
| `context.ts` | `createTestContext()` builds a `BtkContext` with default config for TUI and unit tests |
| `tui.tsx` | `renderTui()` renders a component inside the TUI providers, with `keys` for arrow, enter and esc sequences, `press()` to send them, and `waitFor()` for screens that finish asynchronously |
| `dashboard.tsx` | `openDashboard(tool, project, text)` opens a tool's dashboard in a temp project, as `btk <tool> --ui` would. It waits for `text` and then for Ink to attach its key listeners, so the first key press isn't lost |
| `images.ts` | `writeImage()` writes a noisy test image as PNG, JPEG, WebP or BMP. Noise matters because a flat color compresses to almost nothing in every format |
| `fake-tool.ts` | The `demo` tool: a config slice with defaults, a default action with variadic positionals, config-backed flags, an alias, a hidden failing action and a lazy TUI screen. It is never part of the shipped registry |

## Patterns

Unit tests call the core logic directly:

```typescript
const input = await writeImage(join(dir, "hero.png"), { width: 640, height: 480 });
const result = await optimizeImage(fileAt(input), opts({ maxWidth: 400, dryRun: true }));
expect(result.after).toMatchObject({ width: 400, height: 300 });
```

CLI tests run in-process, which is fast enough to cover every flag and error:

```typescript
const { code, stdout } = await runBtk(["image", "a.png", "--json"], { cwd: project.dir, env: project.env });
expect(JSON.parse(stdout).data.totals.converted).toBe(1);
```

TUI tests send keystrokes:

```typescript
const ui = renderTui(ctx, <FileBrowser root={dir} extensions={[".png"]} multiple onSubmit={onSubmit} />);
await ui.press(keys.down, keys.space, keys.enter);
expect(onSubmit).toHaveBeenCalledWith([join(dir, "a.png")]);
```

Each temp project writes its config in a fresh directory, so `import()` caching never carries a config from one test into another.

## Testing the compiled binary

`bun run test:dist` (`scripts/test-dist.ts`) does three things:

1. Runs `scripts/build.ts` to compile `dist/btk` for this platform
2. Sets `BTK_BIN` to that binary
3. Runs `tests/integration/dist.test.ts`, the same suite as `cli.test.ts`

This catches problems that only appear in compiled builds, such as a missing bundled module, config loading from outside the bundle, or the `bun-toolkit` virtual module.

Without `BTK_BIN`, `dist.test.ts` skips itself so `bun test` stays fast.

## Per-tool test checklist

Every tool needs:

- unit tests for its core logic
- an end-to-end test that runs the CLI and checks its output
- a JSON test that checks the envelope and its `data`
- a CI test that finds no ANSI codes
- a config test: config values apply, env vars override them, flags override both
- a help test for `btk <tool> --help` and `btk <tool> <action> --help`
- a dashboard test with ink-testing-library, if the tool has a `ui`
- binary fixtures such as images generated inside the test, never committed

## Linting and formatting

- `bun run lint` runs oxlint.
- `bun run format` runs Biome, which formats and sorts imports.
- `bun run check` runs Biome, oxlint and tsc.
