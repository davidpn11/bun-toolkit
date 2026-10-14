# bun-toolkit

Bun native API straight in your terminal. One CLI (`btk`), one config, one output style, and an interactive dashboard for every tool.

> Status: v0.1.0 is out through Homebrew and GitHub Releases. The foundation (CLI framework, config, output layer, TUI) and five tools work: `btk image`, `btk hash`, `btk convert`, `btk password` and `btk compress`/`btk decompress`. The npm package comes next, then the documentation site. See [docs/roadmap.md](docs/roadmap.md).

## Install

> Until the repository is public, run `export HOMEBREW_GITHUB_API_TOKEN=$(gh auth token)` before using Homebrew, and download release files with `gh release download v0.1.0 -R davidpn11/bun-toolkit` instead of `curl`.

### Homebrew

This repository is the tap:

```bash
brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit
brew install davidpn11/bun-toolkit/bun-toolkit
```

Homebrew 5.1 and later refuse to load a formula from a tap you haven't trusted. If it does, run the `brew trust` command it prints, such as `brew trust --formula davidpn11/bun-toolkit/bun-toolkit`, then install again. `brew upgrade bun-toolkit` picks up new releases.

### Download a binary

Every [release](https://github.com/davidpn11/bun-toolkit/releases) has binaries for macOS, Linux and Windows, and a `SHA256SUMS` file:

```bash
curl -fsSLO https://github.com/davidpn11/bun-toolkit/releases/download/v0.1.0/btk-darwin-arm64
curl -fsSLO https://github.com/davidpn11/bun-toolkit/releases/download/v0.1.0/SHA256SUMS
grep btk-darwin-arm64 SHA256SUMS | shasum -a 256 -c
chmod +x btk-darwin-arm64 && sudo mv btk-darwin-arm64 /usr/local/bin/btk
```

### From source

Requires [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun link            # puts `btk` and `bun-toolkit` on your PATH
```

Or build a standalone binary:

```bash
bun run build       # -> dist/btk
```

## Usage

```bash
btk --help                  # every command
btk info                    # versions, platform, output mode, config status
btk init                    # create ./btk.config.ts
btk init --format json      # create ./btk.config.json instead
btk init --global           # create ~/.bun-toolkit/config.ts
btk config                  # resolved config, and where each value comes from
btk config validate         # exits 78 if any config is invalid (use it in CI)
btk ui                      # interactive dashboard
btk <tool> --ui             # open a tool's dashboard directly
```

### Tools

| Tool | Bun API | Docs |
| --- | --- | --- |
| `btk image` | `Bun.Image` | [docs/tools/image.md](docs/tools/image.md) |
| `btk hash` | `Bun.CryptoHasher`, `Bun.hash` | [docs/tools/hash.md](docs/tools/hash.md) |
| `btk convert` | `Bun.YAML`, `Bun.TOML`, `Bun.XML`, `Bun.JSON5`, `Bun.JSONC`, `Bun.JSONL` | [docs/tools/convert.md](docs/tools/convert.md) |
| `btk password` | `Bun.password` | [docs/tools/password.md](docs/tools/password.md) |
| `btk compress`, `btk decompress` | `Bun.gzipSync`, `Bun.zstdCompress`, `Bun.deflateSync`, `Bun.Archive`, brotli | [docs/tools/compress.md](docs/tools/compress.md) |

```bash
btk image ./assets -r                      # every image → WebP q80, next to the originals
btk image ./photos --preset web -o dist    # 1920px wide, q75, into dist/ (mirrored)
btk image info hero.png                    # format, dimensions, size
btk image --ui                             # pick files, tweak options, watch it run

btk hash ./dist -r > SHA256SUMS            # sha256sum-compatible checksums
btk hash check SHA256SUMS                  # exits 1 if a file changed
printf hello | btk hash verify - 3610a686  # check standard input against a known hash

btk convert config.yaml                    # JSON on stdout
btk convert data.xml --to yaml -o data.yaml
cat logs.jsonl | btk convert --from jsonl --to json

btk password hash                          # hidden prompt, argon2id
btk password verify "$HASH"                # exits 1 when it doesn't match

btk compress ./dist --each --gzip --brotli # precompress static files
btk compress ./site --zstd                 # → site.tar.zst
btk decompress site.tar.zst                # → site/
```

Every command takes `--json`, `--verbose`, `--no-color`, `--config <path>` and `--help`.

### Output modes

btk picks the output mode once, at startup:

| Mode | When | Output |
| --- | --- | --- |
| `json` | `--json`, `BTK_OUTPUT=json`, `AGENT=true`, or `output.json` in config | One JSON document on stdout: `{ "ok": true, "command": "...", "data": ... }` or `{ "ok": false, "error": { "code", "message", "hint" } }` |
| `ci` | `CI=true`, `NO_COLOR`, `--no-color`, `TERM=dumb`, or stderr not a terminal | Plain text, no ANSI, tab-separated tables |
| `human` | otherwise | Colors, icons, spinners, progress bars |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The command failed |
| 2 | Usage error: unknown command or option, invalid value, missing argument, no terminal for `--ui` |
| 78 | Config error: a config file failed to load or validate |
| 130 | Cancelled (Ctrl+C) |

## Configuration

```ts
// btk.config.ts
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  tools: {
    image: { format: "avif", quality: 70, presets: { hero: { maxWidth: 2560 } } },
    hash: { algorithm: "blake2b512" },
    convert: { to: "yaml", indent: 4 },
    password: { algorithm: "argon2id", memoryCost: 65536 },
    compress: { format: "zstd" },
  },
  output: { verbose: false },
});
```

The same config works as plain JSON in `btk.config.json` or `bun-toolkit.config.json`, which needs nothing installed in the project.

Precedence, from highest to lowest: CLI flags, `BTK_<TOOL>_<KEY>` env vars, the project config (found by walking up from the current directory), the global `~/.bun-toolkit/config.ts` or `config.json`, built-in defaults.

When a tool runs without a project config, btk warns on stderr. Set `noLocalConfig` in the global config to `"off"` to silence it, or `"error"` to make it fail.

btk validates configs strictly and reports every problem at once, with the file, the key path, what it expected, and a "did you mean" for typos:

```
✖ Invalid configuration (2 problems)
  ./btk.config.ts (project)
    output.verbose  Expected boolean, received "yes"
    toolz           Unknown key. Did you mean "tools"?
  → Fix the values above, then check with: btk config validate
```

See [docs/config.md](docs/config.md).

## Development

```bash
bun run dev -- info         # run from source
bun test                    # unit, TUI and integration tests
bun run test:dist           # build the binary and run the end-to-end suite against it
bun run typecheck
bun run lint                # oxlint
bun run format              # biome
bun run check               # biome + oxlint + tsc
```

### Adding a tool

A tool is one folder plus one line in `src/tools/index.ts`:

```ts
// src/tools/hash/tool.ts
import { z } from "zod";
import { defineAction, defineTool, flag, positional } from "../../cli/define.ts";
import { hashFiles } from "./core.ts";

export const hash = defineTool({
  name: "hash",
  description: "Hash files with Bun.CryptoHasher",
  config: z.object({ algorithm: z.enum(["sha256", "sha512", "blake2b256"]).default("sha256") }),
  defaultAction: "file",
  actions: {
    file: defineAction({
      description: "Hash one or more files",
      examples: ["btk hash package.tar.gz --algorithm sha512"],
      args: {
        files: positional(z.array(z.string()).min(1), { description: "Files to hash" }),
        algorithm: flag(z.enum(["sha256", "sha512", "blake2b256"]), {
          alias: "a",
          config: "algorithm",
          description: "Hash algorithm",
        }),
      },
      run: (input, ctx) => hashFiles(input, { signal: ctx.signal }),
      render: (result, out) => out.table(result.rows),
    }),
  },
  ui: () => import("./ui/Dashboard.tsx"), // optional: enables `btk hash --ui`
});
```

That single definition gives you:
- `btk hash ...` routing, plus `btk hash file ...`
- help text with defaults and where they came from
- validated, typo-checked flags
- `tools.hash` in the config schema and in `defineConfig` types
- the `BTK_HASH_ALGORITHM` env var
- JSON output and the `btk ui` home screen entry

Tool dashboards use the components exported from `src/tui/index.ts`, such as `Screen`, `FileBrowser`, `ProgressList`, `ResultTable`, and `OptionsForm`, which builds a form from the same flag specs. See [docs/architecture.md](docs/architecture.md).
