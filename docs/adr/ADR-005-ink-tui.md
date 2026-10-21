# ADR-005: Ink for the TUI, loaded only when it opens

- **Status:** Accepted
- **Decided in:** Phase 0
- **More in:** [visual-language.md](../visual-language.md#the-tui), [architecture.md](../architecture.md#tui-navigation)

## Context

Every tool gets a full-screen dashboard (`btk ui`, `btk <tool> --ui`), but most runs are plain commands that should start fast.

## Decision

- The TUI uses Ink 6 and React 19, imported only when a dashboard opens.
- Every screen uses the shared `<Screen>` frame, global keys and palette, and screens further down the stack stay mounted, so going back restores them.
- OpenTUI stays an option if Ink's rendering becomes the bottleneck.

## Consequences

- Plain commands never load React.
- Dashboards build their option forms from the same flag specs as the CLI ([ADR-002](ADR-002-own-command-framework.md)).
