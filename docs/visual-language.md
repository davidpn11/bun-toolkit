# Visual language

## Overview

Every btk command shares the same output structure and styling. The visual language applies to regular CLI commands (Phase 0) and the full-screen TUI (Phase 7). The same components power both.

## Output structure

Every command produces:

1. A **header line** with the command name and key parameters.
2. A **progress indicator**: spinner for single operations, progress bar for batch operations.
3. A **result block**: structured output as a table, key-value list, or tree.
4. A **summary line**: timing and key stats (files processed, bytes saved, etc.).

## Three output modes

| Component | human (TTY) | ci (no TTY or CI=true) | json (--json or AGENT=true) |
|---|---|---|---|
| `reporter.result()` | Formatted via components | Plain text | JSON to stdout |
| `reporter.log.info()` | Styled icon + text to stderr | Plain text to stderr | Suppressed |
| `reporter.spinner.start()` | Animated spinner on stderr | Static line to stderr | Suppressed |
| `reporter.table()` | Aligned columns | Tab-separated | Included in result JSON |

Mode detection in `src/env.ts`:
- `--json` flag, `BTK_OUTPUT=json`, or `AGENT=true` -> json mode
- `CI=true`, `NO_COLOR=true`, or non-TTY stderr -> ci mode
- Everything else -> human mode

## Reporter interface

```typescript
type OutputMode = "human" | "json" | "ci";

interface Reporter {
  mode: OutputMode;
  result(data: unknown): void;
  log: { error: LogFn; warn: LogFn; info: LogFn; success: LogFn };
  table(rows: Record<string, unknown>[], title?: string): void;
  keyValue(pairs: Record<string, unknown>, title?: string): void;
  list(items: string[], title?: string): void;
  notice(lines: string[]): void;
  summary(stats: Record<string, string | number>): void;
  spinner: { start(msg: string): void; update(msg: string): void; stop(): void };
  progress: { start(total: number, label: string): void; tick(n?: number): void; done(): void };
}
```

Tool code calls `reporter.result(data)` and never checks the output mode.

## Theme

The default theme lives in `src/output/themes/default.ts`:

```typescript
export const defaultTheme = {
  brand:   "#5B8DEF",
  success: "green",
  error:   "red",
  warning: "yellow",
  info:    "blue",
  muted:   "gray",
  icons: {
    success: "✔",      // check mark
    error:   "✖",      // cross mark
    warning: "⚠",      // warning sign
    info:    "ℹ",      // info circle
    bullet:  "•",      // bullet
    arrow:   "→",      // right arrow
  },
} as const;
```

The theme is overridable via config (`theme.brand`, etc.).

## Dependencies

- **ansis** (3KB): colors and ANSI styling. Explicitly Bun-compatible. Handles multi-line strings correctly (re-opens escape codes on each line).
- **nanospinner** (1KB): progress spinner. Degrades to plain text in non-TTY. Single dependency (picocolors, replaced by ansis internally).
- **@clack/prompts**: interactive prompts. Version-pinned, behind an abstraction layer in `src/prompt/prompter.ts`. If it breaks on a future Bun version, swap the implementation without touching tool code.

## The TUI: `btk ui` (Phase 7)

The visual reference is terminal.shop. Full-screen terminal interface with borders, color palette, smooth navigation.

**Tech stack:**
- Ink 6 + React 19 for the foundation. Renders React components to the terminal using Yoga flexbox layout. Powers Claude Code and Gemini CLI.
- OpenTUI (from SST team) as a potential upgrade path. Zig rendering engine via FFI, removes Ink's 30fps cap. Same React component model, so migration is mechanical.

The TUI depends on having multiple tools to navigate. It is Phase 7, after the tools exist.

## Component files

Each output component is a separate file in `src/output/components/`:

| File | Purpose |
|------|---------|
| `log.ts` | error/warn/info/success lines with icons |
| `table.ts` | Aligned columns with headers |
| `key-value.ts` | Key-value pair lists |
| `list.ts` | Bulleted or numbered lists |
| `notice.ts` | Boxed announcements |
| `spinner.ts` | Animated progress spinner |
| `progress-bar.ts` | File processing progress with ETA |
| `summary.ts` | End-of-command stats block |
