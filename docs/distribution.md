# Distribution

## Channels

### npm package (`bun-toolkit`)

The main distribution channel. Three usage patterns:

- `npm install -g bun-toolkit` for global CLI access
- `bun add -D bun-toolkit` as a project devDependency (call `btk` from npm scripts)
- `npx bun-toolkit image optimize` for one-off CI use without installing

The package is a CLI tool, not a library. No programmatic exports.

### Homebrew (`homebrew-bun-toolkit` tap)

For developers who prefer `brew install bun-toolkit`. The tap formula points to GitHub Release binaries. Updated automatically by the release pipeline.

The formula registers both `btk` and `bun-toolkit` as commands.

### GitHub Releases

Every tagged release attaches binaries for all platforms. Source for the Homebrew formula. Covers users who want to curl a binary directly.

### GitHub Action (future)

A `bun-toolkit/setup` action that downloads the binary and adds it to `$PATH`. Different from `oven-sh/setup-bun`, which installs the Bun runtime itself.

Most useful for workflows that run bun-toolkit on every PR (image optimization, config validation). For occasional use, `npx bun-toolkit` is enough.

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

The main package has no library exports. The `bin` field exposes both `btk` and `bun-toolkit`. The `bin.mjs` shim detects the platform and delegates to the compiled binary from the matching `@btk/*` package.

npm only downloads the platform package matching the user's OS and architecture (the others fail the `os`/`cpu` check and are optional).

This is the same pattern used by esbuild, Biome, and Turbo.

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

Bun cross-compiles to 8 targets from a single machine:

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

Build command (`scripts/build.ts` wraps `Bun.build`):
```bash
bun run build                                   # current platform -> dist/btk
bun scripts/build.ts --target bun-linux-x64     # cross-compile
```

Flags: `--minify`, `NODE_ENV=production`, a linked sourcemap, and a plugin that stubs `react-devtools-core`. That package is a dev-only import inside Ink (loaded only when `DEV=true`), and the bundler would otherwise leave it as a missing module.

**No `--bytecode`.** Ink 6 and yoga-layout use top-level await, which bytecode compilation rejects in both ESM and CJS output (verified with Bun 1.4.0 in the Phase 0 spike). Startup is still ~20ms for plain commands because Ink is imported lazily, only when the TUI opens.

The spike also confirmed that a compiled binary can:
- `import()` a user's `btk.config.ts` from any directory
- resolve `import { defineConfig } from "bun-toolkit"` through a runtime `Bun.plugin` virtual module, with no `node_modules`

Binary size: ~63MB (embeds the Bun runtime).

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

Plus the compiled binary (`btk` or `btk.exe`). Nothing else.
