# Visual language

Every btk command uses the same output structure and styling, in the CLI and in the full-screen TUI. Both draw from the same palette and icon set.

## Output structure

A command prints, in order:

1. A header line on stderr with what it is about to do, e.g. `ℹ 4 images → webp · q80`.
2. A spinner for a single operation, or a progress bar for a batch.
3. The result on stdout, as a table, a key-value list or a list.
4. A summary line with counts, sizes and time, e.g. `✔ Done · 3 converted · 1 skipped · 1.2s elapsed`. The icon turns to `⚠` or `✖` when something failed.

## Three output modes

| Component | human (TTY) | ci (no TTY or CI=true) | json (--json or AGENT=true) |
|---|---|---|---|
| action result | `render()` with styled components, stdout | `render()` as plain text, stdout | `{ "ok": true, "command", "data" }` on stdout |
| `reporter.log.*` | Icon and text on stderr | Plain text on stderr | Suppressed |
| `reporter.spinner` | Animated on stderr | One line at the start, one at the end | Suppressed |
| `reporter.progress` | Bar with count and ETA on stderr | A start line and an end line | Suppressed |
| `out.table()` | Aligned columns | Tab-separated | Not called; the data is in the JSON |
| errors | `✖ message`, details and `→ hint` on stderr | Same, without ANSI | `{ "ok": false, "error": { "code", "message", "details?", "hint?" } }` on stdout |

`src/env.ts` picks the mode, highest priority first:

- json when `--json`, `BTK_OUTPUT=json`, `AGENT=true` or `output.json: true` in config
- ci when `CI=true`, `--no-color`, `NO_COLOR`, `TERM=dumb`, `output.color: false`, or stderr is not a terminal
- human otherwise, and interactive only when stdin and stdout are terminals too

In human mode stdout gets colors only when stdout itself is a terminal, so `btk config show | less` stays clean.

## Reporter

```typescript
type Reporter = {
  mode: "human" | "ci" | "json";
  verbose: boolean;
  style: Styler;                       // semantic colors for stderr
  log: { error; warn; info; success; debug };   // debug only with --verbose
  spinner: { start; update; succeed; fail; stop };
  progress: { start(total, label); tick(n?, detail?); done(message?); stop() };
  out: Output;                         // result components, stdout
  json(value): void;                   // the runner calls this, actions don't
  error(error): void;                  // the runner calls this, actions don't
};

type Output = {
  table(rows, { title?, columns? });   // columns: key, label, align, paint
  keyValue(pairs, title?);
  list(items, { title?, ordered? });
  notice(lines);
  summary(stats, title?, tone?);       // tone: success, warning or error; an empty key prints the value alone
  text(line?);
  raw(data);                           // bytes or text exactly as given, e.g. compressed output
  style: Styler;                       // semantic colors for stdout
};
```

Actions return data from `run()` and present it in `render(result, out)`. They never check the output mode. When a command fails, the runner stops any spinner or progress bar before printing the error.

When the result is itself data meant for another program, such as digests or a converted document, stdout carries only that data. The header, progress, problems and summary go to stderr, so redirects and pipes get clean output. `btk hash` and `btk convert` work this way; `btk image`, whose result is a report, prints its table and summary on stdout.

## Colors

btk has one accent color, Bun's pink `#FF1F8F` (`--c-accent` on bun.com). It marks the logo, titles, borders, the selection pointer, flag names in help, spinners and progress bars.

Everything else uses the terminal's named colors so output matches the user's color scheme: `green` for success, `red` for errors, `yellow` for warnings and `gray` for secondary text. Size changes follow the same scale everywhere: green above 20% smaller, yellow for 0 to 20%, red when a file grew.

`src/output/palette.ts` holds the accent, the Ink color names and the icons (`✔ ✖ ⚠ ℹ • → ❯ ◆`). The CLI uses them through `Styler` (`s.accent()`, `s.success()` and so on), and the TUI imports `colors` and `icons` directly. Colors are not configurable.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | The command failed, or a batch finished with failures |
| 2 | Usage error: unknown command or option (with a suggestion), invalid value, missing argument, `--ui` without a terminal |
| 78 | A config file failed to load or validate |
| 130 | Cancelled with Ctrl+C |

## Dependencies

- ansis handles colors, behind `Styler`. It is off in ci and json mode.
- The spinner and progress bar are ours (`src/output/components/`). They write to injectable streams and restore the cursor on exit.
- @clack/prompts is pinned, sits behind `src/prompt/prompter.ts`, and loads only when btk shows a prompt.

## The TUI

`btk ui` opens the home screen and `btk <tool> --ui` opens a tool's dashboard directly. Both need a terminal and human mode. Otherwise the command exits 2 and suggests the non-UI command.

- It uses Ink 6 and React 19, imported only when the TUI opens.
- It runs in the terminal's alternate screen and restores the terminal on quit, on a crash and on process exit.
- Every screen uses `<Screen>`, which draws an accent header with breadcrumbs, a rounded accent border and a footer of key hints.
- Global keys: `↑↓` or `j k` move, `enter` opens, `esc` goes back, `?` shows help, and `q` or `ctrl+c` quits. A text field being edited disables the global keys while you type.
- Screens further down the stack stay mounted, so `esc` returns to a screen as you left it.
- The visual reference is terminal.shop. OpenTUI remains an option if Ink's rendering becomes the bottleneck.

### TUI components

All of these export from `src/tui/index.ts`.

| Component | Purpose |
|---|---|
| `Screen` | Frame with header, breadcrumbs, bordered body and key hints |
| `SelectList` | Arrow-key list with sections, tags, disabled rows and scrolling |
| `FileBrowser` | Folder navigation, extension filter, hidden-file toggle, multi-select, a highlight callback for previews, and `refreshToken` to reload after writes |
| `OptionsForm` | A form built from an action's flag specs (`fieldsFromArgs`), prefilled from config (`initialValues`) and validated with the same zod schemas |
| `ProgressList`, `ProgressBar` | Batch progress with a status per item |
| `ResultTable` | Aligned result columns |
| `TextViewer` | Scrollable text with line numbers, used by the convert preview |
| `TextInput` | One line of typed input, optionally masked with `•` for passwords. It takes every key except esc while focused |
| `Spinner`, `StatusBar`, `KeyHints` | Small building blocks |
| `Mascot` | Bun in a hardhat, drawn with half blocks (34×12 cells). Home shows it when the terminal is at least 94×22 |

### Mascot

`src/tui/mascot.ts` holds the sprite, one character per pixel, mapped through `MASCOT_PALETTE`. It is the only copy. `<Mascot>` draws it with `▀` and `▄`, using the top pixel as the text color and the bottom pixel as the background. `bun scripts/mascot.ts` renders `docs/assets/btk-mascot.svg` and `btk-banner.svg` from it, and `--png` also renders `btk-banner.png` through headless Chrome. To change the mascot, edit the sprite and rerun the script.

## CLI component files

| File | Purpose |
|------|---------|
| `log.ts` | error, warn, info, success and debug lines with icons |
| `table.ts` | Aligned columns, tab-separated in ci mode |
| `key-value.ts` | Key-value lists |
| `list.ts` | Bulleted or numbered lists |
| `notice.ts` | Boxed announcements |
| `spinner.ts` | Animated, static or silent spinner |
| `progress-bar.ts` | Batch progress with ETA |
| `summary.ts` | End-of-command stats line with a tone |
| `live-line.ts` | Rewritable terminal line shared by the spinner and the progress bar |
