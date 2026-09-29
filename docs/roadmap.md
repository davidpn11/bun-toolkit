# Roadmap

## Phase 0: foundation

Build the project skeleton, CLI routing, config system (global + project), output layer, test infrastructure, build scripts, and CI pipeline.

### Deliverables

- `btk --version` and `btk --help` work
- `btk info` prints Bun version, bun-toolkit version, platform, config file status, detected output mode
- `btk init` creates a `btk.config.ts` in the current directory (or `--global` for `~/.bun-toolkit/config.ts`)
- Config loading from both tiers with correct merge order
- `defineConfig()` export for type-safe config authoring
- Reporter with human/json/ci modes
- Output components: log, table, key-value, summary, spinner, progress bar, notice
- Build script that cross-compiles to all targets
- `bun run test:dist` script that builds and tests against the compiled binary
- GitHub Actions: test.yml (PR checks), release.yml (publish), homebrew.yml (formula update)
- npm package structure with JS shim and platform packages
- README with installation instructions and usage examples

### Verification

- `btk --version` prints the version
- `btk --help` lists all registered commands
- `btk info` prints environment details in human mode
- `btk info --json` outputs valid JSON
- `CI=true btk info` produces plain text (no ANSI codes)
- `btk init` creates a valid config with the correct type import
- `btk init --global` creates `~/.bun-toolkit/config.ts`
- Global config merges correctly with project config
- `bun test` passes
- `bun run test:dist` passes
- Cross-compiled binary runs on GitHub Actions runners (macOS, Linux, Windows)

---

## Phase 1: image optimizer

**Bun API**: `Bun.image` (native image encoding/decoding)

### Commands

- `btk image optimize <glob>` - convert and optimize images
- `btk image info <file>` - report dimensions, format, size

### What it does

Converts images between formats (PNG, JPEG, WebP, AVIF) and optimizes file size. Configurable quality, max dimensions, recursive directory scanning.

### Why it matters

Validates the most foundation surface: file I/O, progress bars (batch processing), config integration, structured output (per-file results with before/after sizes), summary component (total savings).

### Config

```typescript
tools: {
  image: {
    quality: 80,
    format: "webp",
    maxWidth: 1920,
    maxHeight: 1080,
  }
}
```

### Examples

```bash
btk image optimize ./assets --format webp --quality 80
btk image optimize ./photos --recursive --max-width 1920
btk image info hero.png
btk image optimize ./icons --format avif --json
```

---

## Phase 2: universal hasher

**Bun API**: `Bun.CryptoHasher`, `Bun.hash`

### Commands

- `btk hash <algorithm> <file...>` - compute hash(es)
- `btk hash verify <file> <expected>` - verify a hash

### What it does

25+ hash algorithms: SHA-256, SHA-512, BLAKE2, MD5, CRC32, xxHash, MurmurHash, and more. HMAC support with `--hmac-key`. Streams files for large file support.

### Why it matters

Simple tool, quick to build. Validates streaming I/O patterns. Replaces shasum, md5sum, cksum with one command.

### Examples

```bash
btk hash sha256 package.tar.gz
btk hash blake2b512 --hmac-key "secret" data.bin
echo "hello" | btk hash crc32
btk hash verify release.tar.gz abc123def456
btk hash sha256 dist/*.js --json
```

---

## Phase 3: format converter

**Bun API**: native YAML, TOML, XML, JSON5, JSONC, JSONL parsers (Rust/C++ implementations)

### Commands

- `btk convert <file> --to <format>` - convert a file
- `btk convert --from <format> --to <format>` - convert stdin

### What it does

Converts between YAML, JSON, TOML, XML, JSON5, JSONC, and JSONL. All parsers are Bun-native. The XML parser is XXE-safe.

### Why it matters

The most broadly useful tool. Strongest CI/agent use case. Validates stdin/stdout piping patterns.

### Config

```typescript
tools: {
  convert: {
    pretty: true,
    indent: 2,
  }
}
```

### Examples

```bash
btk convert config.yaml --to json
btk convert data.xml --to json --pretty
cat logs.jsonl | btk convert --from jsonl --to json
btk convert tsconfig.json --to yaml
curl -s api.example.com/data.xml | btk convert --from xml --to json
```

---

## Phase 4: password hasher

**Bun API**: `Bun.password`

### Commands

- `btk password hash <value>` - hash a password
- `btk password verify <hash> <value>` - verify a password against a hash

### What it does

Argon2id, argon2i, argon2d, and bcrypt. Configurable cost parameters. Auto-salted.

### Why it matters

No simple cross-platform CLI for this. Useful for seed data, testing auth systems, migration scripts.

### Config

```typescript
tools: {
  password: {
    algorithm: "argon2id",
  }
}
```

### Examples

```bash
btk password hash "s3cret"
btk password hash --algorithm bcrypt "s3cret"
btk password verify '$argon2id$...' "s3cret"
btk password hash "s3cret" --json
```

---

## Phase 5: compression suite

**Bun API**: `Bun.gzipSync`, `Bun.deflateSync`, `Bun.zstdCompressSync`, brotli

### Commands

- `btk compress <file> [--gzip|--zstd|--brotli]` - compress a file
- `btk decompress <file>` - decompress a file

### What it does

Compress/decompress with gzip, zstandard, brotli, and deflate. Configurable compression level. Supports directory compression via tar+compress.

### Why it matters

All modern compression formats in one binary. Zstd isn't installed by default on many systems.

### Config

```typescript
tools: {
  compress: {
    format: "zstd",
    level: 9,
  }
}
```

### Examples

```bash
btk compress bundle.js --zstd --level 9
btk compress styles.css --brotli
btk decompress archive.gz
btk compress ./dist --gzip --output dist.tar.gz
```

---

## Phase 6: markdown renderer + plugin system

**Bun API**: `Bun.markdown` (Rust-based CommonMark+GFM parser)

### Commands

- `btk md preview <file>` - render markdown to ANSI terminal output
- `btk md html <file>` - render markdown to HTML

### What it does

The `preview` subcommand renders styled headings, code blocks, tables, and links directly in the terminal. The `html` subcommand outputs clean HTML.

### Why it matters

The ANSI terminal rendering is a distinctive feature. This phase also introduces the plugin system, because markdown is the first tool that benefits from customizable themes and templates.

### Plugin example

```typescript
import { defineConfig } from "bun-toolkit";
import githubMarkdown from "btk-plugin-github-md";

export default defineConfig({
  plugins: [githubMarkdown()],
});
```

### Examples

```bash
btk md preview README.md
btk md html README.md > output.html
btk md preview CHANGELOG.md | less -R
```

---

## Phase 7: interactive TUI

### Command

- `btk ui` (or just `btk` with no arguments)

### What it does

Full-screen interactive mode. Tool selection menu, option configuration, result browsing. Visual reference: terminal.shop.

### Tech stack

- Ink 6 + React 19 for the foundation (same as Claude Code, Gemini CLI)
- OpenTUI (SST team) as a potential upgrade path

### Why it's Phase 7

The TUI depends on having enough tools to navigate. Building it early would mean a menu with one item.

---

## Phase 8 and beyond

- `btk html` - HTMLRewriter-based HTML transformation and scraping
- `btk color` - color format conversion with terminal preview
- `btk tar` - archive creation/extraction with glob filtering
- `btk transpile` - TypeScript/JSX to JS single-file transpilation
- `btk semver` - semantic version comparison and validation
- Website with interactive documentation and visual identity
