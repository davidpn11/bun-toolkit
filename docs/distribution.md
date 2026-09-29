# Distribution

## Channels

### npm package (`bun-toolkit`)

npm is the main channel, and people use it three ways:

- `npm install -g bun-toolkit` puts `btk` on the PATH.
- `bun add -D bun-toolkit` adds it to a project, so npm scripts can call `btk`.
- `npx bun-toolkit image ./assets` runs it once in CI without installing.

The package is a CLI, not a library. Its only export is `defineConfig` and the config types, so `btk.config.ts` gets autocomplete.

### Homebrew (`homebrew-bun-toolkit` tap)

`brew install bun-toolkit` installs from the tap. The formula downloads the binaries from GitHub Releases, and the release pipeline updates it on every release.

The formula installs both `btk` and `bun-toolkit` as commands.

### GitHub Releases

Every tagged release attaches binaries for all platforms. The Homebrew formula downloads them, and anyone can fetch one directly with curl.

### GitHub Action (future)

A `bun-toolkit/setup` action would download the binary and add it to `$PATH`. It differs from `oven-sh/setup-bun`, which installs the Bun runtime.

It helps workflows that run bun-toolkit on every PR, such as image optimization or config validation. For occasional use, `npx bun-toolkit` is enough.

## npm package structure

```
bun-toolkit                     # Main package
  bin: { "btk": "bin.mjs", "bun-toolkit": "bin.mjs" }
  optionalDependencies:
    @btk/darwin-arm64
    @btk/darwin-x64
    @btk/linux-x64
    @btk/linux-arm64
    @btk/windows-x64

@btk/darwin-arm64               # Compiled binary only
@btk/darwin-x64
@btk/linux-x64
@btk/linux-arm64
@btk/windows-x64
```

The `bin` field exposes both `btk` and `bun-toolkit`. The `bin.mjs` shim detects the platform and runs the compiled binary from the matching `@btk/*` package.

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
const pkg = `@btk/${platform}-${arch}`;

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

Each `@btk/{platform}-{arch}` package contains:

```json
{
  "name": "@btk/darwin-arm64",
  "version": "0.1.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "preferUnplugged": true
}
```

It also holds the compiled binary (`btk` or `btk.exe`) and nothing else.
