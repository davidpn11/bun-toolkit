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
| action result | `render()` with styled components, stdout | `render()` as plain text, stdout | `{ "ok": true, "command", "data" }` on stdout |
| `reporter.log.*` | Icon + text on stderr | Plain text on stderr | Suppressed |
| `reporter.spinner` | Animated on stderr | One line at start, one at end | Suppressed |
| `reporter.progress` | Bar with count and ETA on stderr | Start and end lines | Suppressed |
| `out.table()` | Aligned columns | Tab-separated | Not called (data is in the JSON) |
| errors | `✖ message`, details, `→ hint` on stderr | Same, no ANSI | `{ "ok": false, "error": { "code", "message", "details?", "hint?" } }` on stdout |

Mode detection (`src/env.ts`), highest priority first:
- `--json`, `BTK_OUTPUT=json`, `AGENT=true`, or `output.json: true` in config -> json
- `CI=true`, `--no-color`, `NO_COLOR`, `TERM=dumb`, `output.color: false`, or non-TTY stderr -> ci
- Everything else -> human (interactive only if stdin and stdout are TTYs too)

In human mode, stdout gets colors only when stdout itself is a terminal, so `btk config show | less` stays clean.

## Reporter interface

```typescript
type Reporter = {
  mode: "human" | "ci" | "json";
  verbose: boolean;
  style: Styler;                       // semantic colors for stderr
  log: { error; warn; info; success; debug };   // debug only with --verbose
  spinner: { start; update; succeed; fail; stop };
  progress: { start(total, label); tick(n?, detail?); done(message?) };
  out: Output;                         // result components, stdout
  json(value): void;                   // used by the runner only
  error(error): void;                  // used by the runner only
};

type Output = {
  table(rows, { title?, columns? });   // columns: key, label, align, paint
  keyValue(pairs, title?);
  list(items, { title?, ordered? });
  notice(lines);
  summary(stats, title?);
  text(line?);
  style: Styler;                       // semantic colors for stdout
};
```

Actions return data from `run()` and present it in `render(result, out)`. They never check the output mode.

## Colors

One accent color: Bun's pink, `#FF1F8F` (`--c-accent` on bun.com). It marks everything that is "ours": the logo, titles, borders, the selection pointer, flag names in help, spinners and progress bars.

Everything else uses the terminal's own named colors, so output fits the user's color scheme: `green` for success, `red` for errors, `yellow` for warnings, `gray` for secondary text.

`src/output/palette.ts` holds the accent, the Ink color names and the icon set (`✔ ✖ ⚠ ℹ • → ❯ ◆`). The CLI reaches them through `Styler` (`s.accent()`, `s.success()`...), the TUI imports `colors` and `icons` directly. Colors are not configurable.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Command failed (runtime error) |
| 2 | Usage: unknown command/option (with a suggestion), invalid value, missing argument, `--ui` without a terminal |
| 78 | Config failed to load or validate |
| 130 | Cancelled with Ctrl+C |

## Dependencies

- **ansis**: colors, behind the `Styler` interface. Disabled entirely in ci/json.
- **Spinner and progress bar**: our own (`src/output/components/`), writing to injectable streams and restoring the cursor on exit.
- **@clack/prompts**: pinned, behind `src/prompt/prompter.ts`, loaded only when a prompt is shown.

## The TUI

`btk ui` opens the home screen; `btk <tool> --ui` opens a tool's dashboard directly. Both need a terminal and human mode; otherwise the command exits 2 with a hint for the non-UI command.

- Ink 6 + React 19, imported only when the TUI opens.
- Runs in the terminal's alternate screen. The terminal is restored on quit, on crash and on process exit.
- Every screen uses `<Screen>`: accent-colored header with breadcrumbs, a rounded accent border, and a key-hint footer.
- Global keys: `↑↓`/`j k` move, `enter` opens, `esc` goes back, `?` shows help, `q` or `ctrl+c` quits. Text fields lock the global keys while you type.
- Visual reference: terminal.shop. OpenTUI stays the upgrade path.

### TUI components (`src/tui/index.ts`)

| Component | Purpose |
|---|---|
| `Screen` | Frame: header, breadcrumbs, bordered body, key hints |
| `SelectList` | Arrow-key list with sections, tags, disabled rows, scroll window |
| `FileBrowser` | Directory navigation, extension filter, hidden-file toggle, multi-select, highlight callback for previews |
| `OptionsForm` | Form generated from an action's flag specs (`fieldsFromArgs`), prefilled from config (`initialValues`), validated with the same zod schemas |
| `ProgressList` / `ProgressBar` | Batch progress with per-item status |
| `ResultTable` | Aligned result columns |
| `Spinner`, `StatusBar`, `KeyHints` | Small building blocks |
| `Mascot` | Bun in a hardhat, drawn with half blocks (34×12 cells). Home shows it when the terminal is at least 94×22 |

### Mascot

`src/tui/mascot.ts` holds the sprite: one character per pixel, mapped through `MASCOT_PALETTE`. It is the only copy. `<Mascot>` draws it with `▀`/`▄` (top pixel as the color, bottom pixel as the background), and `bun scripts/mascot.ts` renders `docs/assets/btk-mascot.svg` and `btk-banner.svg` from it (`--png` adds `btk-banner.png` through headless Chrome). Edit the sprite, then rerun the script.

## CLI component files

| File | Purpose |
|------|---------|
| `log.ts` | error/warn/info/success/debug lines with icons |
| `table.ts` | Aligned columns (tab-separated in ci mode) |
| `key-value.ts` | Key-value pair lists |
| `list.ts` | Bulleted or numbered lists |
| `notice.ts` | Boxed announcements |
| `spinner.ts` | Animated / static / silent spinner |
| `progress-bar.ts` | Batch progress with ETA |
| `summary.ts` | End-of-command stats line |
| `live-line.ts` | Rewritable terminal line shared by spinner and progress |
