# ADR-006: Changesets, stable releases from master and betas from any branch

- **Status:** Accepted
- **Decided in:** Phase 6
- **More in:** [releasing.md](../releasing.md), [ci-pipeline.md](../ci-pipeline.md)

## Context

Releases need versions, changelog entries, tagged binaries and a Homebrew formula, without anyone tagging commits by hand. Changes also need a way to be tried before they reach master.

## Decision

- Changesets versions releases and writes `CHANGELOG.md`.
- Stable: a branch runs `bun run release:version` before merging, and the merge into `master` publishes. CI creates the tag, the GitHub Release and the formula.
- Beta: **Publish beta** on any branch publishes `-beta.N` to the `bun-toolkit-beta` formula.
- Every workflow uses the built-in `GITHUB_TOKEN`. The jobs that can write to the repository never run code built from the branch: checksums come from `sha256sum`, and the formula generator runs from `master`.

## Consequences

- The release check on every PR says what merging will release, and warns about changesets merged without a version.
- No secrets to manage until npm publishing arrives ([ADR-007](ADR-007-homebrew-before-npm.md)).
