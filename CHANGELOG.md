# bun-toolkit

## 0.2.1

Built on Bun 1.4.0.

### Patch Changes

- improvements to beta release

## 0.2.0

Built on Bun 1.4.0.

### Minor Changes

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`4053ea0`](https://github.com/davidpn11/bun-toolkit/commit/4053ea02d1ad557ecdc0a360b105451a15ef4937) Thanks [@davidpn11](https://github.com/davidpn11)! - add md and serve commands

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`653685d`](https://github.com/davidpn11/bun-toolkit/commit/653685dda94709eeaac8b99d184116b221d0fa1b) Thanks [@davidpn11](https://github.com/davidpn11)! - New `btk serve` tool: `btk serve dist` serves any folder over HTTP and reloads the browser when a file changes, and `btk serve page.html` serves the page's folder and opens it. Folders open their `index.html` or a listing, `--spa` sends unknown routes to `index.html`, `--cors` allows other origins, and `--host 0.0.0.0` makes it reachable from other devices on your network.

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`41b11b2`](https://github.com/davidpn11/bun-toolkit/commit/41b11b29a36d1c39a2b0de7156826721173ebee4) Thanks [@davidpn11](https://github.com/davidpn11)! - Plugins in `btk.config.ts` now run. A plugin can add themes for `btk md` with the `md:theme` hook or replace its HTML page with `md:html:template`, using `definePlugin` and `defineTheme` from `bun-toolkit`. See docs/plugins.md.

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`41b11b2`](https://github.com/davidpn11/bun-toolkit/commit/41b11b29a36d1c39a2b0de7156826721173ebee4) Thanks [@davidpn11](https://github.com/davidpn11)! - New `btk md` tool: `btk md README.md` opens a live-reloading preview in the browser, `btk md CHANGELOG.md --terminal | less -R` renders it for the terminal, `btk md serve docs` serves a whole folder with a sidebar, and `btk md html` writes a standalone page. Pick a look with `--theme`; `btk` and `plain` are built in, and `btk md themes` lists them.

### Patch Changes

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`653685d`](https://github.com/davidpn11/bun-toolkit/commit/653685dda94709eeaac8b99d184116b221d0fa1b) Thanks [@davidpn11](https://github.com/davidpn11)! - Piping btk into a command that stops reading early, such as `btk md CHANGELOG.md --terminal | head`, now ends quietly with exit code 0 instead of printing an EPIPE stack trace.

- [#3](https://github.com/davidpn11/bun-toolkit/pull/3) [`562b782`](https://github.com/davidpn11/bun-toolkit/commit/562b782e42ac1208d8fe40a878e506ab5f9f872d) Thanks [@davidpn11](https://github.com/davidpn11)! - Releases now ship with a changelog, and pre-releases install with `brew install davidpn11/bun-toolkit/bun-toolkit-beta`. The home screen reads "Bun native APIs straight in your terminal".

## 0.2.0-beta.0

Built on Bun 1.4.0.

### Minor Changes

- [#2](https://github.com/davidpn11/bun-toolkit/pull/2) [`18e0412`](https://github.com/davidpn11/bun-toolkit/commit/18e0412) Thanks [@davidpn11](https://github.com/davidpn11)! - First pre-release, published to test the beta channel. It has the same CLI as 0.1.0.
  - Install it with `brew install davidpn11/bun-toolkit/bun-toolkit-beta`. The `bun-toolkit-beta` formula conflicts with `bun-toolkit`, because both install `btk`.
  - Homebrew formulas download with or without `HOMEBREW_GITHUB_API_TOKEN`, and only send a token when one is set.
  - The repository has an MIT `LICENSE` file.

## 0.1.0

Built on Bun 1.4.0.

### Minor Changes

- [#1](https://github.com/davidpn11/bun-toolkit/pull/1) [`e953731`](https://github.com/davidpn11/bun-toolkit/commit/e953731) Thanks [@davidpn11](https://github.com/davidpn11)! - First release of `btk`, a single binary for Bun's native APIs.

  **Tools**

  - `btk image` converts, resizes and inspects images with `Bun.Image`: WebP, AVIF, JPEG, PNG and HEIC output, presets, `--dry-run`, ThumbHash placeholders.
  - `btk hash` hashes files and standard input with 31 algorithms, writes and checks `sha256sum` files, verifies SRI strings and computes HMACs.
  - `btk convert` converts between JSON, YAML, TOML, XML, JSON5, JSONC and JSONL, for single files, folders and pipes.
  - `btk password` hashes, verifies and inspects argon2 and bcrypt hashes, with a hidden prompt.
  - `btk compress` and `btk decompress` handle gzip, zstd, brotli and deflate, and pack folders into `.tar` archives.

  **Configuration**

  - Global config in `~/.bun-toolkit/` and project config found by walking up from the current directory, in TypeScript or JSON (`btk.config.json`, `bun-toolkit.config.json`).
  - Precedence: flags, then `BTK_*` environment variables, then project, global and built-in defaults. `btk config` shows where each value comes from.
  - `noLocalConfig` in the global config warns, stays silent or fails when a tool runs without a project config.
  - `btk init` writes a starter config, and `--format json` writes JSON.

  **Output**

  - Three output modes, human, ci and json, chosen once at startup. `--json` prints one JSON document for scripts and agents.
  - An interactive dashboard for every tool (`btk ui`, `btk <tool> --ui`).

  **Distribution**

  - Standalone binaries for macOS, Linux and Windows on every GitHub Release, with a `SHA256SUMS` file.
  - A Homebrew tap in this repository: `brew install davidpn11/bun-toolkit/bun-toolkit`.

### Patch Changes

- [#1](https://github.com/davidpn11/bun-toolkit/pull/1) [`80bd82d`](https://github.com/davidpn11/bun-toolkit/commit/80bd82d) Thanks [@davidpn11](https://github.com/davidpn11)! - `btk hash` writes `/` in checksum paths on Windows, so a `SHA256SUMS` made on Windows verifies on macOS and Linux.
