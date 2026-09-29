# Configuration

## Overview

bun-toolkit uses TypeScript config files. Bun runs `.ts` natively, so `await import("./btk.config.ts")` works with no jiti, no esbuild, no temp files.

## Two config tiers

### Global config: `~/.bun-toolkit/config.ts`

Personal defaults that follow you across every project: preferred hash algorithm, default image quality, output preferences. Created with `btk init --global` or by hand.

### Project config: `./btk.config.ts`

Project-specific overrides. Image quality for this repo's assets, output format for this project's config files. Committed to git, shared with the team.

## Resolution order (highest priority first)

1. CLI flags (`--quality 80`)
2. Environment variables (`BTK_IMAGE_QUALITY=80`)
3. Project config (`./btk.config.ts`)
4. Global config (`~/.bun-toolkit/config.ts`)
5. Built-in defaults

When bun-toolkit runs as a global CLI with no project config, the global config is the only config. When a project has `btk.config.ts`, that takes priority and the global config fills in anything the project config doesn't set.

## defineConfig

An identity function that gives users autocomplete and type checking:

```typescript
// btk.config.ts
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  tools: {
    image: {
      quality: 80,
      format: "webp",
    },
    hash: {
      algorithm: "sha256",
    },
  },
  plugins: [],
});
```

`defineConfig` does nothing at runtime. Its only job is to carry the type signature. Vite, Nuxt, and tsup all use this pattern.

## Config schema

`tools` is not written by hand: each tool contributes its slice from its `defineTool({ config })` zod schema, and `BtkConfig["tools"]` is derived from the registry in `src/tools/index.ts`. Adding a tool adds its key, its types and its validation.

```typescript
type BtkConfig = {
  // One key per registered tool, typed from the tool's config schema.
  // Planned: image, hash, convert, password, compress, md.
  tools?: ToolsConfig;

  // Global output preferences (flags and env vars still win)
  output?: {
    color?: boolean;              // false = plain text
    json?: boolean;               // always output JSON
    verbose?: boolean;            // debug messages and stack traces
  };

  // Plugins (loaded from config only; the loader arrives with Phase 6)
  plugins?: BtkPlugin[];
};
```

## File discovery

- **Project:** starting in the current directory and walking up to the filesystem root, the first `btk.config.ts`, `btk.config.js` or `btk.config.mjs` wins. Commands work from any subdirectory of a project.
- **Global:** `config.ts`, `config.js` or `config.mjs` inside `~/.bun-toolkit/`. `BTK_CONFIG_DIR` overrides that directory (tests use it to stay isolated).
- **`--config <path>`** replaces project discovery for one invocation. A missing file is a config error.

`btk config path` shows what was found and where it searched.

## Environment variable mapping

Every key of every tool's config schema maps to `BTK_<TOOL>_<KEY>`, with camelCase keys converted to SNAKE_CASE:

- `tools.image.quality` -> `BTK_IMAGE_QUALITY`
- `tools.image.maxWidth` -> `BTK_IMAGE_MAX_WIDTH`
- `output.json` -> `BTK_OUTPUT=json`
- `output.verbose` -> `BTK_VERBOSE=true`

Values are coerced (`"80"` -> `80`, `"true"`/`"1"`/`"yes"` -> `true`, comma-separated lists for arrays) and validated with the same schema as the config file. An invalid value is a config error that names the variable.

## Validation and errors

- Each file is validated on its own with a strict schema, so errors point at the right file and unknown keys are caught.
- Every problem is reported at once, one line per key path, with what was expected and what was received.
- Unknown keys get a suggestion (`toolz` -> `tools`, `tools.imgae` -> `image`) or the list of valid keys.
- Files that cannot be imported (syntax errors, a throw at import time, a non-object default export) are reported with the file and, for syntax errors, the line and column.
- A broken file does not stop the other tiers from loading: the valid layers still merge.
- Rules that only fail once the layers are combined (a tool schema with cross-field checks) are reported under "Combined configuration"; that tool falls back to its defaults.
- Commands that need config fail with exit code **78** (EX_CONFIG). `btk info`, `btk init` and `btk config validate` still run.

```
✖ Invalid configuration (2 problems)
  ./btk.config.ts (project)
    output.verbose  Expected boolean, received "yes"
    toolz           Unknown key. Did you mean "tools"?
  → Fix the values above, then check with: btk config validate
```

## Inspecting config

- `btk config` / `btk config show`: every resolved value and the layer that set it (`default`, `global <path>`, `project <path>`, `env BTK_...`). Add `--json` for scripts.
- `btk config validate`: exit 0 when valid, 78 with the full report when not. Suitable for CI.
- `btk <tool> <action> --help`: shows each flag's effective default and which config set it.

## Implementation notes

- Config files are loaded with `await import(path)`. The module's `default` export is used, or the module itself when there is no default.
- Before the first import, a `Bun.plugin` virtual module registers `bun-toolkit`, so `import { defineConfig } from "bun-toolkit"` resolves even when bun-toolkit is not in the project's `node_modules` (Homebrew install, compiled binary, global config). This works inside `bun build --compile` binaries; `bun run test:dist` covers it.
- Layers merge from lowest to highest priority: defaults, global, project, env. Objects merge key by key. `plugins` arrays are concatenated across tiers. **Every other array is replaced**, so a project's list (e.g. excluded globs) overrides the global one instead of silently adding to it.
- Built-in defaults come from the tools' zod `.default()` values and are applied once, after merging, so each value's source can be reported.
- Config is resolved once per invocation and passed through `BtkContext`. Tools never load config themselves.
