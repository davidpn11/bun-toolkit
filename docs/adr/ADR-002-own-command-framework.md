# ADR-002: Our own command framework instead of citty

- **Status:** Accepted
- **Decided in:** Phase 0
- **More in:** [architecture.md](../architecture.md#command-framework)

## Context

The first plan routed commands with citty. citty 0.2 takes only single-value positionals, has no repeated flags, silently ignores unknown flags, and prints its own errors and help. Typo suggestions, validated values, variadic paths and config-sourced defaults would all have meant working around it.

## Decision

Replace it with `src/cli/`, about 600 lines driven by `defineTool()` and `defineCommand()` descriptors where every argument is a zod schema. One descriptor produces routing, parsing, validation, help, the tool's config slice and env vars, and the TUI option forms.

## Consequences

- Flags, config keys, env vars, help text and TUI forms can't drift apart, because they come from the same schema.
- Features such as "did you mean", `--no-x`, and shell completion (`btk completion`, built from the same registry) cost little to add.
- We maintain the parser ourselves, so its tests live in `src/cli/`.
