---
name: btk-review
description: Review and fix your own implementation work in bun-toolkit before finishing. Use it every time you have written or changed code in this repo (src/, scripts/, tests/, bin/), after the change works and before you report back, and whenever a Stop hook asks for it. It checks the diff for correctness bugs and simplifications, then for this project's conventions (minimal comments, `type` instead of `interface`, small functions, the btk output and tool contracts), fixes what it finds and runs the checks.
---

# btk review

A self-review pass over the code you just wrote, modeled on `/code-review` and extended with bun-toolkit's house rules. The goal is to hand back code the user would not have to correct. Fix what you find. Don't just list it.

## 1. Scope the change

Review only what changed in this piece of work.

```bash
git status --short
git diff HEAD --stat
git diff HEAD -- src scripts tests bin
```

Include untracked files (`git status` lists them as `??`), and read each one in full. If the working tree also holds unrelated earlier changes, limit the review to the files you touched in this task.

## 2. Correctness first

Read every changed hunk with its surrounding code, then look for defects that would make the code do the wrong thing:

- logic errors, off-by-one errors, wrong conditions, inverted checks
- unhandled `undefined` and `null` (the tsconfig has `noUncheckedIndexedAccess`, so a `!` or `as` cast that hides it is suspect)
- errors that should be a `UsageError` (exit 2) or a config error (exit 78), and errors that get swallowed
- async mistakes: a missing `await`, an ignored `signal`, a promise left running after abort
- resource handling: temp files, file handles, the TUI alternate screen and cursor restored on every path
- behavior differences across the three output modes (human, ci, json)

For each suspected bug, confirm it by reading the code path or running it. Drop anything you can't back up with a concrete failing input.

## 3. Reuse and simplicity

- Use what already exists before adding a helper: `src/shared/` (`collectFiles`, `runPool`, `readStdin`), `src/output/format.ts`, the reporter components, and the TUI building blocks exported from `src/tui/index.ts`.
- Remove dead code, unused exports, leftover debug output and speculative options nobody asked for.
- Keep functions small. Split anything long into well-named steps at module level instead of nesting closures. A top-level function that reads like a list of steps is the target (see `parseArgs` in `src/cli/args.ts`).
- Prefer a straightforward loop or early return over clever chains of ternaries.

## 4. Project conventions

Check each one against the diff and fix every violation.

### Minimal comments

Code should explain itself through names. A comment stays only when it says something the code can't: why a choice was made, a non-obvious constraint, a workaround, or a unit or format.

Delete:
- comments that restate the code or the name (`// parse the args`, `/** The width. */`)
- section banners (`// ---- helpers ----`) and decorative dividers
- commented-out code
- change notes (`// added X`, `// now uses Y`, `// fixed`), which belong in the commit message
- JSDoc on internal functions whose name and types already say it all

Keep: short JSDoc on exported API where it adds meaning (units, defaults, edge cases), and one-line "why" comments. When in doubt, cut. Also check tests: test names carry the intent, so they rarely need comments.

### Types, never interfaces

- Declare every object shape as `type X = { ... }`. Never write `interface`, including in `docs/*.md` code samples.
- Where you'd reach for `extends`, use an intersection: `type FlagSpec<S> = FlagOptions & { kind: "flag"; schema: S }`.
- Classes such as `BtkError extends Error` are fine. The rule is about type declarations.
- `bun run lint` enforces this with oxlint's `typescript/consistent-type-definitions`, so a violation also fails `bun run check`.

### Output and visual language (docs/visual-language.md)

- `run()` returns data and `render(result, out)` presents it. Neither checks the output mode.
- Result data goes to stdout through `out`. Logs, spinners and progress go to stderr through `ctx.reporter`. No `console.log` in commands or tools.
- Commands whose result is data (like `btk hash`) print only that data to stdout.
- Colors come from the `Styler` and `src/output/palette.ts`: one accent, Bun pink `#FF1F8F`, and the terminal's named colors for everything else. No hardcoded hex values or ANSI codes elsewhere, and no configurable theme.
- Icons come from `icons` in the palette.
- Errors carry a message, optional details and a `hint`.

### Tool contract (docs/architecture.md)

- Core logic is pure. It takes typed input and `{ signal, onProgress }`, and it never imports from `src/cli`, `src/output` or `src/tui`.
- Flags declare `config: "<key>"` when they have a config default, and flags beat presets through `meta.sources`.
- Registering in `src/tools/index.ts` is the only wiring.

### Tests (docs/testing.md)

New behavior needs tests. A new tool needs the per-tool checklist: unit tests, a CLI end-to-end test, a JSON envelope test, a CI test with no ANSI, a config precedence test, help tests, and a dashboard test if the tool has a `ui`. Generate binary fixtures inside the test and never commit them.

### Docs

If the change alters behavior described in `docs/`, `README.md` or `--help` text, update them in the same change.

## 5. Fix and verify

1. Apply the fixes directly.
2. Format, then run the full checks and the tests:

```bash
bun run format
bun run check
bun test
```

3. If a check fails, fix it and rerun until all three pass. Don't silence a rule or skip a test to get there.

## 6. Report

Add a short "Review" note to your reply. List what you fixed, one line each (file and what changed), plus anything you found but deliberately left alone, with the reason. If nothing needed fixing, say so in one line. Don't repeat the whole diff.
