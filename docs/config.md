# Configuration

## Overview

bun-toolkit uses TypeScript config files. Bun runs `.ts` natively, so `await import("./btk.config.ts")` works with no jiti, no esbuild, no temp files.

## Two config tiers

### Global config: `~/.bun-toolkit/config.ts`

Personal defaults that follow you across every project. Theme preferences, preferred hash algorithm, default image quality. Created with `btk init --global` or by hand.

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
  theme: {
    brand: "#5B8DEF",
  },
  plugins: [],
});
```

`defineConfig` does nothing at runtime. Its only job is to carry the type signature. Vite, Nuxt, and tsup all use this pattern.

## Config schema

```typescript
interface BtkConfig {
  // Per-tool defaults (keyed by tool name)
  tools?: {
    image?: {
      quality?: number;           // 1-100, default 80
      format?: "webp" | "avif" | "jpeg" | "png";
      maxWidth?: number;
      maxHeight?: number;
    };
    hash?: {
      algorithm?: string;         // default "sha256"
    };
    convert?: {
      pretty?: boolean;           // default true
      indent?: number;            // default 2
    };
    password?: {
      algorithm?: "argon2id" | "argon2i" | "argon2d" | "bcrypt";
    };
    compress?: {
      format?: "gzip" | "zstd" | "brotli";
      level?: number;
    };
    md?: {
      theme?: string;             // ANSI theme name
    };
  };

  // Global output preferences
  output?: {
    color?: boolean;              // Override NO_COLOR detection
    json?: boolean;               // Always output JSON
    verbose?: boolean;            // Show debug-level messages
  };

  // Theme customization
  theme?: {
    brand?: string;               // Primary color (hex)
    // Future: more theme slots
  };

  // Plugins (loaded from config only)
  plugins?: BtkPlugin[];
}
```

## File discovery

Config loading searches for these files, in order:

- `btk.config.ts`
- `btk.config.js`
- `btk.config.mjs`

For the global config, the same names are searched inside `~/.bun-toolkit/`.

## Environment variable mapping

Each tool config key maps to an env var with the `BTK_` prefix:

- `tools.image.quality` -> `BTK_IMAGE_QUALITY`
- `tools.hash.algorithm` -> `BTK_HASH_ALGORITHM`
- `output.json` -> `BTK_OUTPUT` (set to `json`)
- `output.verbose` -> `BTK_VERBOSE` (set to `true`)

## Implementation notes

- Config loading uses `Bun.file(path).exists()` to check for files, then `await import(path)` to load.
- The loaded module's `default` export (or the module itself if no default) is used as the config.
- Global and project configs are deep-merged. Arrays (like `plugins`) are concatenated, not replaced.
- The config is resolved once at startup and passed through the BtkContext. Tools never load config themselves.
