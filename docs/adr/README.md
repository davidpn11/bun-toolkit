# Architecture decision records

Each record explains one decision: the problem, what we chose, and what follows from it. The guides in `docs/` describe how things work today; these records say why.

| ADR | Decision | Status |
| --- | --- | --- |
| [001](ADR-001-single-bun-binary.md) | One compiled binary on Bun's native APIs | Accepted |
| [002](ADR-002-own-command-framework.md) | Our own command framework instead of citty | Accepted |
| [003](ADR-003-typescript-config.md) | TypeScript config files, resolved through a virtual module | Accepted |
| [004](ADR-004-output-modes.md) | Three output modes, decided once at startup | Accepted |
| [005](ADR-005-ink-tui.md) | Ink for the TUI, loaded only when it opens | Accepted |
| [006](ADR-006-changesets-releases.md) | Changesets, stable releases from master and betas from any branch | Accepted |
| [007](ADR-007-homebrew-before-npm.md) | Homebrew and GitHub Releases before npm | Accepted |
| [008](ADR-008-fumadocs-site.md) | A Fumadocs site that reads docs/ in place | Accepted |
| [009](ADR-009-plugins-from-config.md) | Plugins load only from the config file | Accepted |
| [010](ADR-010-local-server-boundaries.md) | Local servers stay on your machine and inside their folder | Accepted |
| [011](ADR-011-mermaid-plugin.md) | Mermaid diagrams as a plugin | Proposed |

## Adding one

Copy the shape below into `ADR-<next number>-<short-name>.md` and add a row to the table. Numbers are never reused. A decision that changes an earlier one gets a new record, and the old one's status becomes `Superseded by ADR-<n>`.

```markdown
# ADR-012: <the decision, as a short statement>

- **Status:** Proposed | Accepted | Superseded by ADR-<n>
- **Decided in:** <phase or month>
- **More in:** <links to the guides it affects>

## Context
## Decision
## Consequences
```
