# bun-toolkit

Bun native API straight in your terminal. One CLI (`btk`), one config, one output style, and an interactive dashboard for every tool.

> Status: Phase 3 is done. The foundation (CLI framework, config, output layer, TUI) and three tools work today: `btk image`, `btk hash` and `btk convert`. `btk password` is next. See [docs/roadmap.md](docs/roadmap.md).

## Install (from source)

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

```bash
btk image ./assets -r                      # every image → WebP q80, next to the originals
btk image ./photos --preset web -o dist    # 1920px wide, q75, into dist/ (mirrored)
btk image info hero.png                    # format, dimensions, size
btk image --ui                             # pick files, tweak options, watch it run

btk hash ./dist -r > SHA256SUMS            # sha256sum-compatible checksums
btk hash verify app.tgz 9f86d081…          # exits 1 on a mismatch
echo hello | btk hash crc32                # standard input

btk convert config.yaml                    # JSON on stdout
btk convert data.xml --to yaml -o data.yaml
cat logs.jsonl | btk convert --from jsonl --to json
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
  },
  output: { verbose: false },
});
```

Precedence, from highest to lowest: CLI flags, `BTK_<TOOL>_<KEY>` env vars, project `btk.config.ts` (found by walking up from the current directory), global `~/.bun-toolkit/config.ts`, built-in defaults.

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
