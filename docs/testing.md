# Testing

## Test runner

`bun:test`. Run everything with `bun test`; `bun run test:dist` builds the binary and runs the end-to-end suite against it.

## Layout

| Where | What |
|------|---------|
| `src/**/*.test.ts(x)` | Unit tests next to the code: env detection, formatters, reporter modes, components, arg parser, router, schema introspection, config loader, TUI components and app |
| `tests/integration/cli-suite.ts` | End-to-end suite that spawns btk. Shared by `cli.test.ts` (source) and `dist.test.ts` (compiled binary, `BTK_BIN`) |
| `tests/integration/registry.test.ts` | What a tool gets for free from `defineTool()`, using the test-only `demo` tool, run in-process |
| `tests/support/` | Helpers (below) |

## Test support

| File | Purpose |
|------|---------|
| `streams.ts` | `CaptureStream` (a PassThrough that records output, optionally a fake TTY), `createIO()`, the `ANSI` matcher |
| `tmp.ts` | `createTempProject()`: a temp project dir with an isolated global config dir (`BTK_CONFIG_DIR`) so the real `~/.bun-toolkit` is never read |
| `cli.ts` | `runBtk()` runs the CLI in-process with captured streams (fast); `spawnBtk()` spawns the source or `BTK_BIN` |
| `context.ts` | `createTestContext()`: a `BtkContext` with default config, for TUI and unit tests |
| `tui.tsx` | `renderTui()` renders a component inside the TUI providers; `keys` for arrow/enter/esc sequences; `press()` |
| `fake-tool.ts` | The `demo` tool: config slice with defaults, default action with variadic positionals, config-backed flags, alias, hidden failing action, lazy TUI screen. Never part of the shipped registry |

## Patterns

Core logic is tested directly:

```typescript
const result = await hashFiles({ files: ["tests/fixtures/sample.txt"], algorithm: "sha256" });
expect(result.rows[0].hex).toBe("...");
```

CLI behavior is tested in-process, which is fast enough to cover every flag and error:

```typescript
const { code, stdout, stderr } = await runBtk(["demo", "a.txt", "--json"], { registry: testRegistry(), cwd, env });
expect(JSON.parse(stdout).data.level).toBe(5);
```

TUI components are driven with keystrokes:

```typescript
const ui = renderTui(ctx, <FileBrowser root={dir} extensions={[".png"]} multiple onSubmit={onSubmit} />);
await ui.press(keys.down, keys.space, keys.enter);
expect(onSubmit).toHaveBeenCalledWith([join(dir, "a.png")]);
```

Temp projects write config files in fresh directories, so `import()` module caching never leaks between tests.

## Production-like testing (dist tests)

`bun run test:dist` (`scripts/test-dist.ts`):
1. Runs `scripts/build.ts` to compile `dist/btk` for the current platform
2. Sets `BTK_BIN` to the binary
3. Runs `tests/integration/dist.test.ts`, which is the same suite as `cli.test.ts`

This catches issues that only show up in compiled builds: missing bundled modules, config loading from outside the bundle, the `bun-toolkit` virtual module.

Without `BTK_BIN`, `dist.test.ts` is skipped, so `bun test` stays fast.

## Per-tool test checklist

Every tool phase must include:
- Unit tests for `core.ts`
- An end-to-end test that runs the CLI and checks its output
- JSON mode test (`--json` produces the envelope with the expected `data`)
- CI mode test (no ANSI codes)
- Config test (config values are respected, flags override them, env vars work)
- Help text test (`btk <tool> --help`, `btk <tool> <action> --help`)
- Dashboard test with ink-testing-library, if the tool has a `ui`
- Image and other binary fixtures generated in the test (e.g. with `Bun.Image`), not committed

## Linting and formatting

- **oxlint**: `bun run lint`
- **Biome** (formatter + import sorting): `bun run format`
- `bun run check` runs Biome, oxlint and tsc
