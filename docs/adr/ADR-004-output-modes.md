# ADR-004: Three output modes, decided once at startup

- **Status:** Accepted
- **Decided in:** Phase 0
- **More in:** [visual-language.md](../visual-language.md#three-output-modes), [vision.md](../vision.md#three-contexts-one-codebase)

## Context

The same commands run in a terminal, in CI pipelines, and under AI agents that need to parse the result.

## Decision

- `src/env.ts` picks one mode at startup: json (`--json`, `BTK_OUTPUT=json`, `AGENT=true`, config), ci (`CI=true`, no color, or stderr not a terminal), or human.
- An action's `run()` returns data and its `render()` presents it. Neither checks the mode: the reporter does. In json mode the result is one `{ ok, command, data }` document on stdout.
- Results go to stdout and logs, spinners and progress to stderr.

## Consequences

- Every command works for agents without extra code.
- A command that never finishes on its own, such as a server, can't answer with one JSON document. `btk serve` and `btk md serve` refuse json mode unless `--json` asks for it explicitly.
- The reporter is the one place that writes to the terminal, so it also escapes control characters from file names and content.
