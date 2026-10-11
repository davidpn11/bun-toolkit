# Roadmap

## Phase 0: foundation (done)

Phase 0 built the project skeleton, CLI framework, config system (global and project), output layer, TUI foundation, test setup and build scripts. After it, adding a tool means one folder and one line in the registry.

The TUI foundation moved here from the TUI polish phase. That way every tool can ship a dashboard from its first release (`btk image --ui`) instead of waiting for enough tools to fill a menu.

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

The CI workflows and packaging were left for the first release, which is now Phase 6.

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

## Phase 2: universal hasher (done)

Bun API: `Bun.CryptoHasher` and `Bun.hash`.

The full reference is [docs/tools/hash.md](tools/hash.md).

### Commands

- `btk hash <algorithm> <files...>` computes hashes. The algorithm is optional, and `--algorithm` or config sets it too.
- `btk hash verify <file> <expected>` checks one file and exits 1 on a mismatch.
- `btk hash check <sums-file>` verifies every line of a checksums file.
- `btk hash algorithms` lists what is supported.
- `btk hash --ui` opens a dashboard to pick files and an algorithm.

### What it does

It supports 31 algorithms: 19 cryptographic ones through `Bun.CryptoHasher` and 12 fast ones through `Bun.hash`. `--hmac-key` adds HMAC, and `--encoding` prints hex, base64 or base64url. Cryptographic hashes and crc32 stream files, and every command reads standard input.

Beyond the original plan it shipped `check` for checksums files, SRI values like `sha384-…` in `verify`, and algorithm detection from the hash length. Output uses the `sha256sum` format so the files it writes work with `sha256sum -c`, and it skips the file its own stdout is redirected into.

### Why it mattered

It replaces shasum, md5sum, cksum and b2sum with one command. It also added stdin input and data-only stdout to the foundation, which `btk convert` reuses.

### Examples

```bash
btk hash sha256 package.tar.gz
btk hash blake2b512 --hmac-key "secret" data.bin
echo "hello" | btk hash crc32
btk hash verify release.tar.gz abc123def456
btk hash ./dist -r > SHA256SUMS && btk hash check SHA256SUMS
```

---

## Phase 3: format converter (done)

Bun API: `Bun.YAML`, `Bun.TOML`, `Bun.XML`, `Bun.JSON5`, `Bun.JSONC` and `Bun.JSONL`.

The full reference is [docs/tools/convert.md](tools/convert.md).

### Commands

- `btk convert <files...> --to <format>` converts files, printing one result to stdout or writing several next to their originals.
- `btk convert --from <format> --to <format>` converts standard input.
- `btk convert formats` lists what it reads and writes.
- `btk convert --ui` opens a dashboard with a live preview.

### What it does

It reads JSON, YAML, TOML, XML, JSON5, JSONC and JSONL, and writes all of them except JSONC. Every parser is part of Bun.

Beyond the original plan it shipped `-o`, `--write` and `--out-dir` with the same overwrite rules as `btk image`, format detection for JSON, JSONL and XML on stdin, strict JSONL with line numbers, TOML dates written as ISO strings for other formats, and automatic `<root>` wrapping for XML.

### Why it mattered

CI scripts and agents often need one format turned into another, and one command now covers the common ones. It is also the first tool whose main output is a document on stdout meant for piping.

### Config

```typescript
tools: {
  convert: {
    to: "json",
    indent: 2,
    pretty: true,
  }
}
```

### Examples

```bash
btk convert config.yaml
btk convert data.xml --to json --no-pretty
cat logs.jsonl | btk convert --from jsonl --to json
btk convert tsconfig.json --to yaml -o tsconfig.yaml
curl -s api.example.com/data.xml | btk convert --to json
```

---

## Phase 4: password hasher (done)

Bun API: `Bun.password`.

The full reference is [docs/tools/password.md](tools/password.md).

### Commands

- `btk password hash [passwords...]` hashes passwords from arguments, standard input (one per line) or a hidden prompt.
- `btk password verify <hash> [password]` checks a password and exits 1 when it doesn't match.
- `btk password inspect <hash>` shows the algorithm and cost, and whether the hash is weaker than your settings.
- `btk password --ui` opens a dashboard with masked input.

### What it does

It supports argon2id, argon2i, argon2d and bcrypt, with configurable memory, passes and bcrypt cost, and a new salt for every hash.

Beyond the original plan it shipped a hidden prompt that asks twice and draws on stderr, a warning when a password is passed as an argument, one hash per line of standard input for seed data, `inspect` with rehash advice, and the same advice from `verify`. The JSON output never contains the password.

### Why it mattered

No simple cross-platform CLI does this. It helps with seed data, debugging logins, manual account resets and migrations between frameworks.

### Examples

```bash
btk password hash
btk password hash --algorithm bcrypt --cost 12
printf 'admin123\nuser123\n' | btk password hash
btk password verify '$argon2id$...'
btk password inspect '$2b$10$...'
```

---

## Phase 5: compression suite (done)

Bun API: `Bun.gzipSync`, `Bun.deflateSync`, `Bun.zstdCompress` and `Bun.Archive`, with brotli from Bun's native `node:zlib`, because Bun has no `Bun.brotli`.

The full reference is [docs/tools/compress.md](tools/compress.md).

### Commands

- `btk compress <files...>` compresses files next to the originals, or packs each folder into one archive.
- `btk decompress <files...>` restores files and extracts archives like `tar -x`.
- `btk compress formats` lists the formats with their level ranges.
- `btk compress --ui` and `btk decompress --ui` open dashboards.

### What it does

It compresses and decompresses gzip, zstd, brotli and deflate. Levels follow each format's own range, and the defaults favor small files: gzip 9 (libdeflate goes up to 12), zstd 19, brotli 11. Folders become `.tar.gz`, `.tar.zst` or `.tar.br` archives through `Bun.Archive`.

Beyond the original plan it shipped `--each` with several formats at once for precompressing web assets, skipping files that wouldn't shrink, standard input and output for pipelines, format detection from magic bytes, `--stdout` for reading compressed logs, and the same overwrite rules as the other tools.

### Why it mattered

One binary covers every common compression format, including on systems that don't ship zstd or brotli.

### Config

```typescript
tools: {
  compress: {
    format: "zstd",
    level: 19,
  }
}
```

### Examples

```bash
btk compress bundle.js --zstd --level 9
btk compress ./dist --each --gzip --brotli
btk decompress archive.tar.gz
btk compress ./dist --gzip -o dist.tar.gz
```

---

## Phase 6: first release, 0.1 (next)

The plans are in [docs/ci-pipeline.md](ci-pipeline.md) and [docs/distribution.md](distribution.md). This work used to be a list of leftovers at the end of Phase 0. It now has its own phase so it lands before more features do.

### What ships

- `test.yml` runs `bun run check`, `bun test`, a build and `bun run test:dist` on every pull request and push to `main`, on macOS, Linux and Windows.
- `release.yml` runs when a `v*` tag is pushed. It builds the five platform binaries, runs `test:dist` wherever the runner can execute them, and attaches the binaries to a GitHub Release with a `SHA256SUMS` file made by `btk hash`.
- The npm package `bun-toolkit`, with the `bin.mjs` shim and the five `@btk/*` platform packages. `"private": true` comes off `package.json`.
- The Homebrew tap, which `homebrew.yml` updates after every release.

### Why now

Five tools work, but the test suite only runs on one Mac, and nobody can install btk without cloning the repo. CI also protects Phase 8, whose plugin loader changes how config loads.

### How we'll check it

- A pull request shows the test workflow passing on all three operating systems.
- Pushing `v0.1.0` creates a GitHub Release with the binaries, and `btk hash check SHA256SUMS` passes against them.
- On a machine without Bun, `npx bun-toolkit --version`, `npm install -g bun-toolkit` and `brew install bun-toolkit` all give `0.1.0`.

---

## Phase 7: documentation site

The docs stay markdown files in `docs/` that read well on GitHub. VitePress builds a website from the same files, and a workflow publishes it to GitHub Pages on every push to `main`.

### What ships

- A landing page, `docs/index.md`, with the banner, the mascot, the install commands and a short tour of the tools.
- A getting-started page covering installation, `btk init`, a first command for each tool and the output modes.
- A sidebar that groups pages by reader: a guide (getting started, config, output modes), the tools (`docs/tools/*`), and contributing (architecture, testing, CI, distribution, plugins and the roadmap).
- Search, navigation and dark mode from VitePress. The only site-specific files are `docs/.vitepress/config.ts` and the landing page's frontmatter.
- `pages.yml`, which deploys the site from `main` and builds it on pull requests so broken links fail the check.

### Why VitePress

It reads plain markdown without required frontmatter, and relative links such as `tools/image.md` work both on GitHub and on the site, so every page is written once. Starlight and Docusaurus want their own folder layout and frontmatter, which makes the files read worse on GitHub. Building the site with `btk md html` stays an experiment for after Phase 8.

### How we'll check it

- Every page reads correctly on GitHub and on the site, and its links work in both.
- A dead link fails `bunx vitepress build docs`, so the pull request check catches it.
- The README and the npm package link to the site.

---

## Phase 8: markdown renderer and plugin system

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

## Phase 9: TUI polish

The TUI foundation shipped in Phase 0, and every tool brings its own dashboard. Phase 9 works on the app as a whole once several tools exist.

- `btk` with no arguments opens `btk ui` in an interactive terminal.
- Flows that span tools, such as converting a file and then hashing the result.
- A history of results within a session.
- The visual reference is terminal.shop.
- OpenTUI, from the SST team, remains an option if Ink's rendering becomes the bottleneck.

---

## Phase 10 and later

- `btk html` transforms and scrapes HTML with HTMLRewriter.
- `btk color` converts color formats and previews them in the terminal.
- `btk tar` creates and extracts archives with glob filters.
- `btk transpile` turns a TypeScript or JSX file into JavaScript.
- `btk semver` compares and validates semantic versions.
- Interactive examples on the documentation site.
