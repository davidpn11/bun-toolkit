# Roadmap

| Phase | What | Status |
| --- | --- | --- |
| 0 | Foundation: CLI framework, config, output modes, TUI, tests, build | Done |
| 1 | `btk image` | Done |
| 2 | `btk hash` | Done |
| 3 | `btk convert` | Done |
| 4 | `btk password` | Done |
| 5 | `btk compress` and `btk decompress` | Done |
| 6 | First release: CI, binaries, Homebrew, Changesets, betas from branches | Done |
| 7 | Documentation site | Done |
| 8 | `btk md`, themes, the plugin system, and `btk serve` | Done |
| 9 | TUI polish | Planned |
| 10 | More tools and follow-ups | Ideas |

## Phase 0: foundation (done)

Phase 0 built the project skeleton, CLI framework, config system (global and project), output layer, TUI foundation, test setup and build scripts. After it, adding a tool means one folder and one line in the registry.

The TUI foundation moved here from the TUI polish phase. That way every tool can ship a dashboard from its first release (`btk image --ui`) instead of waiting for enough tools to fill a menu.

### What shipped

- `btk --version`, `btk --help`, and help for each command and action with examples, choices and config-sourced defaults
- `btk info`, which prints the Bun and bun-toolkit versions, platform, config file status, output mode and why btk chose that mode
- `btk init [--global] [--format ts|json] [--force]`, which writes `btk.config.ts`/`.json` or `~/.bun-toolkit/config.ts`/`.json` and asks before overwriting (it refuses when not interactive)
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

## Phase 6: first release, 0.1 (done)

The plans are in [docs/ci-pipeline.md](ci-pipeline.md) and [docs/distribution.md](distribution.md). This work used to be a list of leftovers at the end of Phase 0. It now has its own phase so it lands before more features do.

### What ships

- `test.yml` runs `bun run check`, `bun test`, a build and `bun run test:dist` on every pull request and push to `master`, on macOS, Linux and Windows.
- `release.yml` publishes when a merge into `master` changes the version, which `bun run release:version` does on the branch before the merge. It builds the five platform binaries, runs `test:dist` wherever the runner can execute them, and attaches the binaries to a GitHub Release with a `SHA256SUMS` file made by `btk hash` and the changelog entry as notes.
- `beta.yml` publishes a beta of any branch on demand, numbered `-beta.N` from the existing tags, and `release-check.yml` tells every PR what merging releases.
- The npm package `@bun-toolkit/cli`, with the `bin.mjs` shim and the five `@bun-toolkit/*` platform packages. `"private": true` comes off `package.json`. This comes after the Homebrew channel.
- The Homebrew formulas `bun-toolkit` and `bun-toolkit-beta` in `Formula/`, which `homebrew.yml` rewrites after every release. v0.1.0 shipped this way.
- Changesets for versions and `CHANGELOG.md`, with stable releases from `master` and betas from any branch (see [releasing.md](releasing.md)).

### Why now

Five tools work, but the test suite only runs on one Mac, and nobody can install btk without cloning the repo. CI also protects Phase 8, whose plugin loader changes how config loads.

### How we'll check it

- A pull request shows the test workflow passing on all three operating systems.
- Pushing `v0.1.0` creates a GitHub Release with the binaries, and `btk hash check SHA256SUMS` passes against them.
- On a machine without Bun, `brew install davidpn11/bun-toolkit/bun-toolkit` gives `0.1.0`. Once npm ships, `npx @bun-toolkit/cli --version` and `npm install -g @bun-toolkit/cli` do too.

---

## Phase 7: documentation site (done)

The docs stay markdown files in `docs/` that read well on GitHub. A Fumadocs site in `website/` builds from the same files, and `pages.yml` publishes it to GitHub Pages at [bun-toolkit.davidpn.com](https://bun-toolkit.davidpn.com) on every push to `master`.

### What ships

- A landing page with the banner, the install commands and a card for each tool.
- `docs/getting-started.md`, covering installation, `btk init`, a first command for each tool and the output modes.
- A sidebar with two groups: a guide (getting started, config, output modes, plugins) and the tools (`docs/tools/*`). The contributor pages (architecture, testing, CI, distribution, releasing, the roadmap and the vision) stay on GitHub only.
- Search, navigation and dark mode from Fumadocs, with Bun pink as the accent. The site is a static export, so GitHub Pages serves plain files.
- `pages.yml`, which deploys the site from `master` and builds it on pull requests that touch `docs/` or `website/`.

### How it stays out of the way

Everything for the site lives in `website/`: its own `package.json`, lockfile, `tsconfig.json` and Next.js app. It isn't a workspace, so a root `bun install`, the CLI build, changesets and releases never see it. The docs need no frontmatter. `website/lib/pages.ts` lists the pages in the site, with their sidebar titles and descriptions.

Relative links such as `tools/image.md` work on GitHub as they are. At build time the site rewrites them to its own routes, sends links to pages it leaves out to GitHub, and fails the build on a link to a missing file.

### Why Fumadocs

It reads markdown from any folder, so the docs keep their GitHub-friendly layout. The site's look, search and sidebar come from one package, and the static export needs no server. Phase 8's `btk md serve docs` previews the same files locally.

### How we check it

- Every page reads correctly on GitHub and on the site, and its links work in both.
- A dead link or a type error fails the `Docs site` check on the pull request.
- The README links to the site.

---

## Phase 8: markdown, themes, plugins and btk serve (done)

Bun APIs: `Bun.markdown`, a CommonMark and GFM parser written in Rust, for rendering; `Bun.serve` and `Bun.file` for the live previews; `Bun.YAML` for front matter.

### Commands

- `btk md preview <file>` opens a live-reloading page in the browser, or renders for the terminal when the output is piped or `--terminal` is passed. `btk md <file>` is short for it, and a folder argument serves the folder.
- `btk md serve [folder]` serves every markdown file in a folder with a sidebar, folder index pages and live reload.
- `btk md html <file>` writes a standalone themed page, or only the body with `--fragment`.
- `btk md themes` lists the built-in themes and the ones plugins add.
- `btk serve [path]` serves any folder, or a file's folder with that page opened, over HTTP with live reload.

### What shipped

**Markdown preview**

- The browser preview runs on `127.0.0.1`, opens your browser, and updates the page on save without losing the scroll position. Images and other files next to the markdown are served, so relative links work.
- The terminal rendering wraps to the terminal width (up to 100 columns, or `--columns`) and draws boxed tables with column alignment, nested and numbered lists, task lists, quotes, rules and framed code blocks. `--hyperlinks` turns links into clickable OSC 8 links.
- Piped output is plain. `--terminal` keeps the colors for a pager such as `less -R`. JSON mode returns the rendering as data.
- JavaScript and TypeScript code blocks get syntax highlighting in both outputs, from Bun's own highlighter, recolored by the theme.
- `btk md html` pages are self-contained. Headings get `id`s, and GFM's tag filter turns `<script>` and `<iframe>` into text.
- Front matter is left out of every output, and its `title` names the page and its sidebar entry.

**Folder preview**

- `btk md serve docs` lists every page in a sidebar grouped by folder and marks the current one.
- URLs follow the file paths, so links such as `tools/hash.md` and `../README.md#install` work as they do on GitHub.
- Folders open their `README.md` or `index.md`, or a list of their pages. `/docs` redirects to `/docs/`.
- Saving any page or stylesheet reloads open pages, and new files appear in the sidebar. `node_modules` and dot folders are skipped.

**Themes**

- A theme styles both outputs: element styles and characters for the terminal (bullets, task markers, heading prefixes, the quote bar, rules, box corners), and a stylesheet for the page.
- `btk` (Bun pink, light and dark) and `plain` (no color, ASCII, a serif page) are built in. Pick one with `--theme`, `tools.md.theme` or `BTK_MD_THEME`.
- A theme can `extend` another and change only what it needs. `--css` or `tools.md.css` adds a stylesheet without writing a theme, and the `btk` page reads its colors from CSS variables.
- Colors turn off with `NO_COLOR`, `--no-color` or `CI`, and the theme's characters still apply.

**Plugin system**

- Plugins in `plugins: [...]` run their `setup(hooks)` the first time a command asks for a hook, so a broken plugin only breaks the commands that use plugins. Errors name the plugin.
- Hooks are either collect hooks, where every handler contributes, or replace hooks, where the last handler wins. `md:theme` (collect) adds themes. `md:html:template` (replace) replaces the page and receives the title, body, stylesheet, reload script and sidebar.
- `definePlugin` and `defineTheme` come from `"bun-toolkit"` at runtime, so plugins work in the compiled binary. Every plugin theme is validated, and invalid keys and colors are reported with the theme and plugin name.

**btk serve**

- Serves any folder as it is. Folders open `index.html` or a listing with folder-first order, sizes and `../`. Content types come from `Bun.file`, and responses send `Cache-Control: no-cache`.
- Adds a reload script to every HTML page and reloads open pages when any file changes.
- `--spa` answers unknown routes with the root `index.html`, `--cors` allows any origin, and `--host 0.0.0.0` shares the folder with your network, printing the LAN URLs and a warning. `--port` and `--no-open` work as in md, and config keys mirror the flags.
- It complements `bun ./index.html`, which bundles an app from source with hot reload: `btk serve` sends files as they are and runs from the binary without Bun.

**Dashboards**

- `btk md --ui` lists the markdown files in the folder and renders the picked one in the terminal with the theme.
- `btk serve --ui` serves the folder, shows the URL and options, and lists requests as they arrive. Leaving the screen stops the server.

**One server for both, with security checks**

- `btk md` and `btk serve` share one server in `src/shared/serve.ts`.
- Requests stay inside the served folder: no `..` escapes, no symlinks that lead out, and no dotfiles such as `.env`, even on Windows with `\` in the URL.
- On loopback the server only answers `127.0.0.1` and `localhost`, which blocks DNS rebinding. When exposed, it also answers IP addresses and the machine's name.
- When file watching can't start, as with a very large folder on Linux, btk warns and keeps serving without reloads.

**Every command**

- Piping btk into a reader that stops early, such as `| head`, now exits quietly with 0 instead of printing an EPIPE stack trace. Exiting 0 keeps `set -o pipefail` scripts working, as ripgrep does.

### Why it matters

Few CLIs render markdown in the terminal, and fewer preview it in the browser with the same theme. Markdown is also the first tool where people want more than config values, which is why the plugin system arrives here. The preview server turned out to be generic, so it ships a second time as `btk serve` instead of staying an md detail.

### Plugin example

```typescript
import { defineConfig } from "bun-toolkit";
import githubMarkdown from "btk-plugin-github-md";

export default defineConfig({
  plugins: [githubMarkdown()],
  tools: { md: { theme: "github" } },
});
```

[docs/plugins.md](plugins.md) shows how to write one.

### Examples

```bash
btk md README.md
btk md CHANGELOG.md --terminal | less -R
btk md serve docs
btk md html README.md --css print.css > README.html
btk md README.md --theme plain --terminal --columns 72
btk serve dist --spa
btk serve site --host 0.0.0.0
btk serve demo/page.html
```

### How we checked it

- `bun test` covers the renderers, highlighting, themes and their validation, front matter, the plugin loader, the shared server (path, symlink, dotfile and Host checks, live reload, watch failures), folder serving, `btk serve`, and quiet exits on closed pipes.
- `bun run test:dist` runs the end-to-end suite against the compiled binary, including a plugin that imports `definePlugin` and `defineTheme` and a pipe closed early.
- `btk md serve docs` shows every page in `docs/` with working links. Checked by hand in the browser, at desktop and phone widths.
- It ships as a beta first, published from its branch with `gh workflow run beta.yml --ref feature/md`: `bun run release:try beta -- btk md themes` lists the themes, and the release container renders a markdown file.

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
- `btk md build` writes a folder of markdown out as a static site, the way `btk md serve` shows it.
- Shell tab completion: `btk completion zsh|bash|fish`, installed by Homebrew, completing tools, actions, flags, choice values and theme names.

### Open questions from Phase 8

- `btk md serve` and `btk serve` wait for Ctrl+C even in json mode, so an agent running them with `AGENT=true` waits forever. They could refuse to start in json mode unless asked.
- Pages with a strict Content-Security-Policy block the injected reload script, so live reload silently stops on them.
- HTML that isn't UTF-8 can be mangled when the reload script is added.
- `btk serve` answers `POST` and `PUT` with the file instead of `405`, and the `/folder` → `/folder/` redirect drops the query string.
