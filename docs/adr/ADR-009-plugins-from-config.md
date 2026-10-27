# ADR-009: Plugins load only from the config file

- **Status:** Accepted
- **Decided in:** Phase 8
- **More in:** [plugins.md](../plugins.md)

## Context

`btk md` was the first tool where people wanted more than config values: their own themes, their own page. Plugins run in btk's process with every Bun API.

## Decision

- Plugins are listed in `plugins: [...]` in a TypeScript config. btk never discovers or installs them globally, so a project's behavior depends only on its config.
- Hooks are synchronous and either **collect** (every handler contributes) or **replace** (the last handler wins).
- A plugin's `setup()` runs the first time a command asks for a hook, so a broken plugin only breaks the commands that use plugins. Errors name the plugin.

## Consequences

- JSON configs can't hold plugins, because plugins are functions.
- New features that not everyone needs can ship as plugins with their own hooks, such as the Mermaid plugin in [ADR-011](ADR-011-mermaid-plugin.md).
