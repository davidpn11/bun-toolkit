# Configuration

bun-toolkit reads TypeScript config files. Bun runs `.ts` natively, so `await import("./btk.config.ts")` works without jiti, esbuild or temp files.

## Two config tiers

### Global config in `~/.bun-toolkit/`

Personal defaults that apply in every project, such as your usual image quality or output preferences. `btk init --global` creates `config.ts`, and `btk init --global --format json` creates `config.json`. You can also write either by hand.

### Project config in `./btk.config.ts` or `./btk.config.json`

Overrides for one project, such as the image settings for this repo's assets. Commit it so the whole team gets the same results. `btk init` creates `btk.config.ts`, and `btk init --format json` creates `btk.config.json`.

## Resolution order

Highest priority first:

1. CLI flags (`--quality 80`)
2. Environment variables (`BTK_IMAGE_QUALITY=80`)
3. Project config (`./btk.config.ts`)
4. Global config (`~/.bun-toolkit/config.ts`)
5. Built-in defaults

Without a project config, the global config is the only config. With one, the project config wins and the global config fills in any key the project leaves unset.

## defineConfig

`defineConfig` returns its argument unchanged. It exists so your editor can autocomplete and type-check the config:

```typescript
// btk.config.ts
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  tools: {
    image: {
      format: "webp",
      quality: 80,
      maxWidth: 1920,
      presets: { hero: { maxWidth: 2560, quality: 85 } },
    },
    hash: { algorithm: "sha256", encoding: "hex" },
    convert: { to: "yaml", indent: 2 },
    password: { algorithm: "argon2id" },
    compress: { format: "zstd", level: 19 },
  },
  output: { verbose: false },
});
```

Vite, Nuxt and tsup use the same pattern.

## JSON configs

btk is a CLI, so a project doesn't need bun-toolkit installed. A TypeScript config still loads without it, but the editor marks the `bun-toolkit` import as unresolved. A JSON config avoids that and holds the same values:

```json
{
  "tools": {
    "image": { "format": "webp", "quality": 80 },
    "hash": { "algorithm": "sha256" }
  },
  "output": { "verbose": false }
}
```

JSON configs may contain comments and trailing commas. They can't hold plugins, which are functions.

## Running without a local config

When a tool command (`image`, `hash`, `convert`, `password`, `compress`, `decompress`, `md`, `serve`, or a tool's `--ui`) finds no project config, btk prints a warning on stderr and runs with the global config or the built-in defaults:

```
⚠ No local config found, using the global config (~/.bun-toolkit/config.ts)
  → Create one with "btk init", or set noLocalConfig: "off" in ~/.bun-toolkit/config.ts
```

`noLocalConfig` in the global config controls this:

| Value | Behavior |
| --- | --- |
| `"warn"` (default) | Print the warning and run |
| `"off"` | Run silently |
| `"error"` | Fail with exit code 78 |

`BTK_NO_LOCAL_CONFIG` overrides it for one shell or CI job. Setting `noLocalConfig` in a project config is an error, because a project config means the check already passed. `info`, `init`, `config`, `ui` and `--help` never check. In json mode btk prints no warning.

## Config schema

Nobody writes the `tools` schema by hand. Each tool contributes its slice from the zod schema in `defineTool({ config })`, and `BtkConfig["tools"]` derives from the registry in `src/tools/index.ts`. Adding a tool adds its key, its types and its validation.

```typescript
type BtkConfig = {
  // One key per registered tool, typed from the tool's config schema.
  // Shipped: image, hash, convert, password, compress, md, serve (docs/tools/).
  tools?: ToolsConfig;

  // Output preferences. Flags and env vars still win.
  output?: {
    color?: boolean;              // false means plain text
    json?: boolean;               // always print JSON
    verbose?: boolean;            // debug messages and stack traces
  };

  // Global config only. What tool commands do without a project config.
  noLocalConfig?: "warn" | "off" | "error";

  // Plugins load from config only. See docs/plugins.md.
  plugins?: BtkPlugin[];
};
```

## File discovery

btk looks for the project config in the current directory, then in each parent up to the filesystem root, and uses the first match. Commands therefore work from any subdirectory of a project. In each folder it checks these names in order:

1. `btk.config.ts`, `btk.config.js`, `btk.config.mjs`, `btk.config.json`
2. `bun-toolkit.config.ts`, `bun-toolkit.config.js`, `bun-toolkit.config.mjs`, `bun-toolkit.config.json`

The global config is `config.ts`, `config.js`, `config.mjs` or `config.json` inside `~/.bun-toolkit/`, checked in that order. `BTK_CONFIG_DIR` points btk at a different directory, which the tests use to stay isolated.

`--config <path>` replaces project discovery for one run. If the file doesn't exist, btk reports a config error.

`btk config path` shows what btk found and where it searched.

## Environment variables

Every key of every tool's config schema maps to `BTK_<TOOL>_<KEY>`, with camelCase keys in SNAKE_CASE:

| Config key | Environment variable |
| --- | --- |
| `tools.image.quality` | `BTK_IMAGE_QUALITY` |
| `tools.image.maxWidth` | `BTK_IMAGE_MAX_WIDTH` |
| `tools.hash.algorithm` | `BTK_HASH_ALGORITHM` |
| `tools.convert.to` | `BTK_CONVERT_TO` |
| `tools.password.algorithm` | `BTK_PASSWORD_ALGORITHM` |
| `tools.compress.format` | `BTK_COMPRESS_FORMAT` |
| `tools.md.theme` | `BTK_MD_THEME` |
| `tools.serve.port` | `BTK_SERVE_PORT` |
| `output.json` | `BTK_OUTPUT=json` |
| `output.verbose` | `BTK_VERBOSE=true` |
| `noLocalConfig` | `BTK_NO_LOCAL_CONFIG=off` |

btk converts the text to the right type (`"80"` becomes `80`, and `"true"`, `"1"` or `"yes"` become `true`; arrays are comma-separated), then validates it with the same schema as the config file. An invalid value is a config error that names the variable.

## Validation and errors

btk validates each file on its own with a strict schema, so an error points at the right file and a misspelled key fails instead of being ignored. It reports every problem at once, one line per key path, with what it expected and what it received. Unknown keys get a suggestion (`toolz` to `tools`, `tools.imgae` to `image`) or the list of valid keys.

When a file can't be imported because of a syntax error, a throw at import time or a default export that isn't an object, btk names the file. For syntax errors it also gives the line and column.

A broken file doesn't stop the other tiers from loading, and the valid layers still merge. If a tool's schema has a rule that only fails once the layers combine, such as a cross-field check, btk reports it under "Combined configuration" and that tool uses its defaults.

Commands that need config exit with code 78 (EX_CONFIG). `btk info`, `btk init` and `btk config validate` still run.

```
✖ Invalid configuration (2 problems)
  ./btk.config.ts (project)
    output.verbose  Expected boolean, received "yes"
    toolz           Unknown key. Did you mean "tools"?
  → Fix the values above, then check with: btk config validate
```

## Inspecting config

`btk config` (or `btk config show`) lists every resolved value and the layer that set it: `default`, `global <path>`, `project <path>` or `env BTK_...`. Add `--json` for scripts.

`btk config validate` exits 0 when every config is valid and 78 with the full report when one isn't, which makes it a good CI check.

`btk <tool> <action> --help` shows each flag's effective default and which config set it.

## Implementation notes

- btk loads `.ts`, `.js` and `.mjs` config files with `await import(path)` and uses the module's `default` export, or the whole module when there is no default. It reads `.json` files with `Bun.JSONC.parse`.
- Before the first import, a `Bun.plugin` virtual module registers `bun-toolkit`. That makes `import { defineConfig } from "bun-toolkit"` resolve even when bun-toolkit isn't in the project's `node_modules`, as with a Homebrew install, the compiled binary or the global config. It works inside `bun build --compile` binaries, and `bun run test:dist` checks it.
- Layers merge from lowest to highest priority: defaults, global, project, env. Objects merge key by key. `plugins` arrays concatenate across tiers. Every other array is replaced, so a project's list overrides the global one instead of adding to it.
- btk applies the `.default()` values from each tool's zod schema once, after merging, so it can report where each value came from.
- btk resolves config once per run and passes it through `BtkContext`. Tools never load config themselves.
