# ADR-007: Homebrew and GitHub Releases before npm

- **Status:** Accepted
- **Decided in:** Phase 6
- **More in:** [distribution.md](../distribution.md)

## Context

People need to install btk without cloning the repo. The unscoped `bun-toolkit` npm name and the `@btk` scope belong to other npm users.

## Decision

- First channel: binaries on GitHub Releases with a `SHA256SUMS` file, and this repository as a Homebrew tap with the `bun-toolkit` and `bun-toolkit-beta` formulas.
- npm comes later, in the `bun-toolkit` npm org: `@bun-toolkit/cli` with a `bin.mjs` shim and one `@bun-toolkit/<platform>` package per binary.

## Consequences

- `btk update` upgrades through Homebrew, or downloads and verifies the new binary.
- Plugins that ship as packages, such as [ADR-011](ADR-011-mermaid-plugin.md)'s, need the npm channel first.
- Before publishing, configs must import from a name the editor can resolve: `@bun-toolkit/cli`, or the virtual module answering to it too ([ADR-003](ADR-003-typescript-config.md)).
