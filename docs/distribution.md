# Distribution

## Channels

### npm package (`@bun-toolkit/cli`)

npm publishing comes after the Homebrew channel. The unscoped `bun-toolkit` name and the `@btk` scope belong to other npm users, so the packages live in the `bun-toolkit` npm org. People will use them three ways:

- `npm install -g @bun-toolkit/cli` puts `btk` on the PATH.
- `bun add -D @bun-toolkit/cli` adds it to a project, so npm scripts can call `btk`.
- `npx @bun-toolkit/cli image ./assets` runs it once in CI without installing.

The package is a CLI, not a library. Its only export is `defineConfig` and the config types, so `btk.config.ts` gets autocomplete.

The runtime virtual module serves `import { defineConfig } from "bun-toolkit"`, but an editor resolves types through `node_modules`, where the package will be `@bun-toolkit/cli`. Before publishing, decide whether configs import from `@bun-toolkit/cli` or whether the virtual module also answers to that name. JSON configs avoid the question.

### Homebrew (this repository is the tap)

`homebrew.yml` rewrites the formulas in `Formula/` after every release. They download the binaries from GitHub Releases and install both `btk` and `bun-toolkit` as commands.

```bash
brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit
brew install davidpn11/bun-toolkit/bun-toolkit        # stable
brew install davidpn11/bun-toolkit/bun-toolkit-beta   # pre-releases
```

The two formulas conflict, because both install `btk`. Homebrew 5.1 and later ask you to trust formulae from third-party taps, and print the `brew trust` command to run.

Only homebrew-core and homebrew-cask packages appear on formulae.brew.sh and install with a bare `brew install bun-toolkit`. homebrew-core needs a public repository, an open-source license, a stable release, a formula that builds from source, and notability: at least 30 forks, 30 watchers or 75 stars, or 90, 90 or 225 when the owner submits it (see Homebrew's [Package Acceptance Policy](https://docs.brew.sh/Package-Acceptance-Policy)).

### GitHub Releases

Every tagged release attaches binaries for all platforms. The Homebrew formula downloads them, and anyone can fetch one directly with curl.

### GitHub Action (future)

A `bun-toolkit/setup` action would download the binary and add it to `$PATH`. It differs from `oven-sh/setup-bun`, which installs the Bun runtime.

It helps workflows that run bun-toolkit on every PR, such as image optimization or config validation. For occasional use, `npx @bun-toolkit/cli` is enough.

## npm package structure

```
@bun-toolkit/cli                # Main package
  bin: { "btk": "bin.mjs", "bun-toolkit": "bin.mjs" }
  optionalDependencies:
    @bun-toolkit/darwin-arm64
    @bun-toolkit/darwin-x64
    @bun-toolkit/linux-x64
    @bun-toolkit/linux-arm64
    @bun-toolkit/windows-x64

@bun-toolkit/darwin-arm64               # Compiled binary only
@bun-toolkit/darwin-x64
@bun-toolkit/linux-x64
@bun-toolkit/linux-arm64
@bun-toolkit/windows-x64
```

The `bin` field exposes both `btk` and `bun-toolkit`. The `bin.mjs` shim detects the platform and runs the compiled binary from the matching `@bun-toolkit/*` package.

npm downloads only the platform package that matches the user's OS and architecture. The others are optional and fail the `os` and `cpu` check.

esbuild, Biome and Turbo ship the same way.

## The JS shim (`bin.mjs`)

```javascript
#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const platform = process.platform === "win32" ? "windows"
               : process.platform === "darwin" ? "darwin"
               : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const pkg = `@bun-toolkit/${platform}-${arch}`;

let binPath;
try {
  const pkgPath = dirname(fileURLToPath(import.meta.resolve(`${pkg}/package.json`)));
  binPath = join(pkgPath, platform === "windows" ? "btk.exe" : "btk");
} catch {
  console.error(`bun-toolkit: unsupported platform ${platform}-${arch}`);
  process.exit(1);
}

execFileSync(binPath, process.argv.slice(2), { stdio: "inherit" });
```

## Cross-compilation

Bun cross-compiles to 8 targets from one machine:

| Target | Description |
|--------|-------------|
| `bun-darwin-arm64` | macOS Apple Silicon |
| `bun-darwin-x64` | macOS Intel |
| `bun-linux-x64` | Linux x64 (glibc) |
| `bun-linux-arm64` | Linux ARM64 (glibc) |
| `bun-linux-x64-musl` | Linux x64 (musl/Alpine) |
| `bun-linux-arm64-musl` | Linux ARM64 (musl/Alpine) |
| `bun-windows-x64` | Windows x64 |
| `bun-windows-arm64` | Windows ARM64 |

`scripts/build.ts` wraps `Bun.build`:

```bash
bun run build                                   # current platform -> dist/btk
bun scripts/build.ts --target bun-linux-x64     # cross-compile
```

The build minifies, sets `NODE_ENV=production`, writes a linked sourcemap, and stubs `react-devtools-core` with a plugin. Ink imports that package only when `DEV=true`, but without the stub the bundler would leave it as a missing module.

The build does not use `--bytecode`. Ink 6 and yoga-layout use top-level await, which bytecode compilation rejects in both ESM and CJS output. We confirmed this with Bun 1.4.0 in the Phase 0 spike. Plain commands still start in about 20ms because btk imports Ink only when the TUI opens.

The spike also confirmed that a compiled binary can:

- `import()` a user's `btk.config.ts` from any directory
- resolve `import { defineConfig } from "bun-toolkit"` through a runtime `Bun.plugin` virtual module, without `node_modules`

The binary is about 63 MB because it embeds the Bun runtime.

## Platform package structure

Each `@bun-toolkit/{platform}-{arch}` package contains:

```json
{
  "name": "@bun-toolkit/darwin-arm64",
  "version": "0.1.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "preferUnplugged": true
}
```

It also holds the compiled binary (`btk` or `btk.exe`) and nothing else.
