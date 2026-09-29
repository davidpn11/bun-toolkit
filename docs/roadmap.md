# Roadmap

## Phase 0: foundation

Project skeleton, CLI framework, config system (global + project), output layer, TUI foundation, test infrastructure, and build scripts. Every tool after this is "one folder + one registry line".

**Change from the original plan:** the TUI foundation moved here from Phase 7. Every tool can ship a dashboard from day one (`btk image --ui`) instead of waiting for enough tools to fill a menu.

### Done

- `btk --version`, `btk --help`, and per-command / per-action help with examples, choices and config-sourced defaults
- `btk info`: Bun and bun-toolkit versions, platform, config file status, output mode and why it was chosen
- `btk init [--global] [--force]`: writes `btk.config.ts` or `~/.bun-toolkit/config.ts`, asks before overwriting (refuses when not interactive)
- `btk config show | validate | path`: resolved values with their source; `validate` exits 78 on bad config
- `btk ui`: home screen (tools + Info + Config), with `btk <tool> --ui` wired for any tool that declares `ui`
- `defineTool()` / `defineAction()`: one descriptor gives routing, help, validated flags, config slice, env vars, JSON output and the TUI entry
- Config: global + project (walk-up discovery), `--config`, `BTK_*` env vars, strict zod validation with all problems reported at once and typo suggestions, per-key source tracking, `defineConfig()` types derived from the registry, a runtime virtual module so `import { defineConfig } from "bun-toolkit"` works without node_modules
- Reporter with human / ci / json modes; one JSON envelope for success and errors; exit codes 0 / 1 / 2 / 78 / 130
- Output components: log, table, key-value, list, notice, summary, spinner, progress bar
- TUI components: Screen, SelectList, FileBrowser, OptionsForm (generated from flag specs), ProgressList, ResultTable, Spinner, StatusBar, KeyHints; navigation stack, help overlay, alternate screen with guaranteed restore
- `bun run build` (current platform or `--target`), `bun run test:dist` (end-to-end suite against the binary)
- Tests: unit, TUI (ink-testing-library), in-process and spawned integration, dist
- README with installation and usage

### Deferred to the first release

- GitHub Actions: test.yml, release.yml, homebrew.yml
- npm package structure with the JS shim and `@btk/*` platform packages
- Cross-compiled binaries verified on macOS, Linux and Windows runners

### Verification

- `btk --version` prints the version; `btk --help` lists every registered command
- `btk info` / `btk info --json` / `CI=true btk info` (no ANSI)
- `btk ifno` exits 2 with `Did you mean "btk info"?`
- `btk init`, `btk init --global`; project values override global ones, and `btk config show` says where each came from
- An invalid config makes `btk config validate` exit 78 and list every problem with its file
- `btk ui` opens the home screen in a terminal; without a terminal it exits 2 with a hint
- `bun test` and `bun run test:dist` pass

---

## Phase 1: image optimizer

**Bun API**: `Bun.Image` (native image encoding/decoding; `Bun.file(path).image()`)

### Commands

- `btk image optimize <paths...>` - convert and optimize images (also `btk image <paths...>`)
- `btk image info <file>` - report dimensions, format, size, optional ThumbHash placeholder
- `btk image --ui` - dashboard: file browser with a metadata preview, multi-select, options form prefilled from config, live progress, results with total savings

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

## Phase 7: TUI polish

The TUI foundation shipped in Phase 0 and every tool brings its own dashboard. Phase 7 is about the whole-app experience once several tools exist.

- `btk` with no arguments opens `btk ui` in an interactive terminal
- Cross-tool flows (e.g. convert a file, then hash the result)
- Result history within a session
- Visual reference: terminal.shop
- OpenTUI (SST team) stays the upgrade path if Ink's rendering becomes the bottleneck

---

## Phase 8 and beyond

- `btk html` - HTMLRewriter-based HTML transformation and scraping
- `btk color` - color format conversion with terminal preview
- `btk tar` - archive creation/extraction with glob filtering
- `btk transpile` - TypeScript/JSX to JS single-file transpilation
- `btk semver` - semantic version comparison and validation
- Website with interactive documentation and visual identity
