# Roadmap

## Phase 0: foundation (done)

Phase 0 built the project skeleton, CLI framework, config system (global and project), output layer, TUI foundation, test setup and build scripts. After it, adding a tool means one folder and one line in the registry.

The TUI foundation moved here from Phase 7. That way every tool can ship a dashboard from its first release (`btk image --ui`) instead of waiting for enough tools to fill a menu.

### What shipped

- `btk --version`, `btk --help`, and help for each command and action with examples, choices and config-sourced defaults
- `btk info`, which prints the Bun and bun-toolkit versions, platform, config file status, output mode and why btk chose that mode
- `btk init [--global] [--force]`, which writes `btk.config.ts` or `~/.bun-toolkit/config.ts` and asks before overwriting (it refuses when not interactive)
- `btk config show | validate | path`. `show` prints resolved values with their source, and `validate` exits 78 on bad config
- `btk ui`, a home screen with the tools, Info and Config, plus `btk <tool> --ui` for any tool that declares a `ui`
- `defineTool()` and `defineAction()`, where one descriptor gives routing, help, validated flags, a config slice, env vars, JSON output and the TUI entry
- Global and project config with walk-up discovery, `--config`, `BTK_*` env vars, strict zod validation that reports every problem at once with typo suggestions, per-key source tracking, `defineConfig()` types derived from the registry, and a runtime virtual module so `import { defineConfig } from "bun-toolkit"` works without `node_modules`
- A reporter with human, ci and json modes, one JSON envelope for success and errors, and exit codes 0, 1, 2, 78 and 130
- Output components for logs, tables, key-value lists, lists, notices, summaries, spinners and progress bars
- TUI components (Screen, SelectList, FileBrowser, OptionsForm built from flag specs, ProgressList, ResultTable, Spinner, StatusBar, KeyHints), a navigation stack, a help overlay, and an alternate screen that always restores the terminal
- `bun run build` for this platform or a `--target`, and `bun run test:dist` to run the end-to-end suite against the binary
- Unit, TUI, in-process, spawned and dist tests
- A README with installation and usage

### Left for the first release

- GitHub Actions workflows: test.yml, release.yml and homebrew.yml
- The npm package with the JS shim and the `@btk/*` platform packages
- Cross-compiled binaries checked on macOS, Linux and Windows runners

### How we checked it

- `btk --version` prints the version, and `btk --help` lists every registered command.
- `btk info`, `btk info --json` and `CI=true btk info` all work, and the last has no ANSI codes.
- `btk ifno` exits 2 with `Did you mean "btk info"?`.
- After `btk init` and `btk init --global`, project values override global ones, and `btk config show` says where each came from.
- An invalid config makes `btk config validate` exit 78 and list every problem with its file.
- `btk ui` opens the home screen in a terminal, and without a terminal it exits 2 with a hint.
- `bun test` and `bun run test:dist` pass.

---

## Phase 1: image optimizer (done)

Bun API: `Bun.Image`, for encoding and decoding images natively (`Bun.file(path).image()`).

The full reference is [docs/tools/image.md](tools/image.md).

### Commands

- `btk image optimize <paths...>` converts and compresses images. `btk image <paths...>` does the same.
- `btk image info <paths...>` reports format, dimensions and size, with an optional ThumbHash placeholder.
- `btk image presets` lists the built-in presets and the ones in your config.
- `btk image --ui` opens a dashboard with a file browser, an image preview, multi-select, an options form prefilled from config, live progress, and results with total savings.

### What it does

It converts between JPEG, PNG, WebP, AVIF and HEIC, and reads GIF, BMP and TIFF. It sets quality, fits images inside a maximum width and height, and scans folders recursively.

Beyond the original plan it also shipped `--format original`, `--palette` for PNGs, `--dry-run`, `--out-dir` with mirrored subfolders, presets you can define in config, glob arguments and atomic writes. Results don't depend on timing: btk leaves outputs from earlier runs alone and resolves colliding inputs to the best source. We dropped webp-conv's `--strip` flag because `Bun.Image` has no metadata option, so the flag would have done nothing.

### Why this tool came first

It exercised most of the foundation at once: file I/O, progress bars for batches, config, per-file results with before and after sizes, and the summary line.

### Config

```typescript
tools: {
  image: {
    format: "webp",
    quality: 80,
    maxWidth: 1920,
    presets: { hero: { maxWidth: 2560, quality: 85 } },
  }
}
```

### Examples

```bash
btk image ./assets -r
btk image ./photos --preset web --out-dir dist/img
btk image ./icons --format avif --json
btk image info hero.png --placeholder
```

---

## Phase 2: universal hasher (next)

Bun API: `Bun.CryptoHasher` and `Bun.hash`.

### Commands

- `btk hash <algorithm> <file...>` computes hashes.
- `btk hash verify <file> <expected>` checks a file against a hash and exits 1 on a mismatch.

### What it does

It supports more than 25 algorithms, including SHA-256, SHA-512, BLAKE2, MD5, CRC32, xxHash and MurmurHash. `--hmac-key` adds HMAC. It streams files, so large files don't load into memory, and it reads stdin.

### Why it matters

It replaces shasum, md5sum and cksum with one command. It is small, and it adds stdin input and streaming to the foundation, which `btk convert` reuses.

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

Bun API: the native YAML, TOML, XML, JSON5, JSONC and JSONL parsers.

### Commands

- `btk convert <file> --to <format>` converts a file.
- `btk convert --from <format> --to <format>` converts stdin.

### What it does

It converts between YAML, JSON, TOML, XML, JSON5, JSONC and JSONL. Every parser is part of Bun, and the XML parser ignores external entities, so it is safe against XXE attacks.

### Why it matters

CI scripts and agents often need one format turned into another, and this handles the common ones in one command. It is also the first tool that writes its result to stdout for piping.

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

Bun API: `Bun.password`.

### Commands

- `btk password hash <value>` hashes a password.
- `btk password verify <hash> <value>` checks a password against a hash.

### What it does

It supports argon2id, argon2i, argon2d and bcrypt, with configurable cost parameters and automatic salts.

### Why it matters

No simple cross-platform CLI does this. It helps with seed data, auth tests and migration scripts.

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

Bun API: `Bun.gzipSync`, `Bun.deflateSync`, `Bun.zstdCompressSync` and brotli.

### Commands

- `btk compress <file> [--gzip|--zstd|--brotli]` compresses a file.
- `btk decompress <file>` decompresses a file.

### What it does

It compresses and decompresses with gzip, zstd, brotli and deflate at a configurable level. It compresses folders by building a tar first.

### Why it matters

One binary covers every common compression format, and many systems don't ship zstd.

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

## Phase 6: markdown renderer and plugin system

Bun API: `Bun.markdown`, a CommonMark and GFM parser written in Rust.

### Commands

- `btk md preview <file>` renders markdown in the terminal with ANSI styling.
- `btk md html <file>` renders markdown to HTML.

### What it does

`preview` shows headings, code blocks, tables and links with terminal styling. `html` writes HTML.

### Why it matters

Few CLIs render markdown in the terminal. This phase also adds the plugin system, because markdown is the first tool where people will want their own themes and templates.

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

The TUI foundation shipped in Phase 0, and every tool brings its own dashboard. Phase 7 works on the app as a whole once several tools exist.

- `btk` with no arguments opens `btk ui` in an interactive terminal.
- Flows that span tools, such as converting a file and then hashing the result.
- A history of results within a session.
- The visual reference is terminal.shop.
- OpenTUI, from the SST team, remains an option if Ink's rendering becomes the bottleneck.

---

## Phase 8 and later

- `btk html` transforms and scrapes HTML with HTMLRewriter.
- `btk color` converts color formats and previews them in the terminal.
- `btk tar` creates and extracts archives with glob filters.
- `btk transpile` turns a TypeScript or JSX file into JavaScript.
- `btk semver` compares and validates semantic versions.
- A website with interactive documentation.
