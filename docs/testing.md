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
| `tests/release/` | A Homebrew container for trying a published release (see [Testing a published release](#testing-a-published-release)). `bun test` only runs its argument tests |

## Test support

| File | Purpose |
|------|---------|
| `streams.ts` | `CaptureStream`, a PassThrough that records output and can pretend to be a TTY; `createIO()`; the `ANSI` matcher |
| `tmp.ts` | `createTempProject()` makes a temp project with its own global config dir (`BTK_CONFIG_DIR`), so tests never read the real `~/.bun-toolkit`. `emptyDir()` is the default working directory, so no `btk.config.ts` in the repo or its parents leaks in |
| `cli.ts` | `runBtk()` runs the CLI in-process with captured streams, and `spawnBtk()` spawns the source or `BTK_BIN`. Both take `stdin` to pipe text in |
| `server.ts` | `freePort()` finds an unused port and `waitForPage()` polls until a server answers, for tests that run `btk md serve` or `btk serve` with an `AbortSignal` |
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

## Testing a published release

`bun run release:try` installs a release the way a user gets it, in a throwaway Linux container. It's for checking a release after CI publishes it. It uses Podman when it's installed, otherwise Docker, and `BTK_CONTAINER_ENGINE=podman` or `=docker` picks one. On a Mac, Podman needs its Linux VM running first:

```bash
brew install podman
podman machine init
podman machine start
```

```bash
bun run release:try                      # stable, then a shell
bun run release:try beta                 # the latest pre-release, then a shell
bun run release:try stable -- btk info   # run one command instead of the shell
```

Before it starts the container, `release:try` asks GitHub for three things: the latest published release on the channel, the version in `package.json` on the channel's branch (`master` or `beta`), and the changesets waiting on that branch. It prints the latest release and warns when the branch is ahead of it:

- **Changesets waiting:** they were merged, but no `bun run release:version` turned them into a release, so the container installs the older release.
- **A version that isn't published:** the version was bumped and pushed, but the publish workflow is still running or failed.

It passes the latest version into the container, which fails when the formula installs anything else, for example when the Homebrew formula update failed. Without network access to GitHub it warns and skips these checks. Set `GITHUB_TOKEN` if you hit GitHub's rate limit.

The container starts from the `homebrew/brew` image. It taps this repository from GitHub, trusts and installs `bun-toolkit` or `bun-toolkit-beta`, then checks the release:

- `btk --version` and `bun-toolkit --version` both print the version of the installed formula.
- `brew test` passes. It runs the formula's own test.
- It prints the CPU architecture, so you can see which binary ran.

Any failed check stops the container with a non-zero exit code. Otherwise you get a `bash` shell with `btk` on the PATH, in `~/workspace`.

Put your own files for manual testing, such as photos, configs or archives, in `tests/release/test_assets/`. Git ignores that folder. When it exists, the container mounts it read-only and copies its contents into `~/workspace`, so commands that write next to their input, like `btk image photo.jpg`, work. Nothing they write reaches your folder, and the copy disappears with the container. Type `exit` or press Ctrl+D to leave; the container is removed when you do. `podman kill` or `docker kill` works too.

A command goes after `--`, and the channel has to come before it, because `bun run` drops a leading `--`. The tap is cloned fresh on every start, so a new release needs no image rebuild.

The container runs on your machine's own CPU, so on an Apple Silicon Mac it tests `btk-linux-arm64`. It doesn't emulate x86_64: Bun binaries crash under QEMU emulation, and the x86_64 Linux binary already runs the full end-to-end suite natively in CI. The macOS binaries also run that suite in CI, and a Homebrew install on your Mac covers the rest.

The files are `tests/release/Dockerfile`, `entrypoint.sh` (install, check, then the shell) and `run.ts` (builds the image and starts the container). `.dockerignore` keeps `test_assets/` out of the image build.

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
