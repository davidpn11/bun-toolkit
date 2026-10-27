# ADR-003: TypeScript config files, resolved through a virtual module

- **Status:** Accepted
- **Decided in:** Phase 0
- **More in:** [config.md](../config.md)

## Context

Tools need per-user and per-project defaults, with editor autocomplete. Bun runs `.ts` natively, so `await import("./btk.config.ts")` works without jiti, esbuild or temp files. But a Homebrew install or the compiled binary has no `bun-toolkit` in any `node_modules` for the config's `import { defineConfig } from "bun-toolkit"`.

## Decision

- Two tiers: a global config in `~/.bun-toolkit/` and a project config, `btk.config.ts` or `btk.config.json`, found by walking up from the working directory. Priority, highest first: flags, `BTK_*` env vars, project, global, built-in defaults.
- Before the first import, a `Bun.plugin` virtual module answers `import … from "bun-toolkit"`, so configs work in the compiled binary.
- JSON configs are accepted for people who don't want code in config; they can't hold plugins.

## Consequences

- A project config is code that runs with the user's permissions whenever btk runs in that folder, like any build tool's config. `btk update` therefore skips the project config.
- Config resolves once per run and reaches tools through `BtkContext`; tools never load config themselves.
- Merging must ignore keys such as `__proto__` from JSON configs.
