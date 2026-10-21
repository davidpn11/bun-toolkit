# ADR-010: Local servers stay on your machine and inside their folder

- **Status:** Accepted
- **Decided in:** Phase 8, tightened after the October 2026 security review
- **More in:** [tools/serve.md](../tools/serve.md#security), [tools/md.md](../tools/md.md)

## Context

`btk serve` and `btk md` previews serve files from a folder the user picks, often one with content they didn't write: a cloned repo, a downloaded site, generated docs.

## Decision

- Listen on `127.0.0.1` unless `--host` says otherwise, and answer only `Host` names that match, to block DNS rebinding.
- Serve only paths inside the folder: no `..`, no symlinks that lead out or to a dotfile, no dotfiles. Index files and redirects go through the same checks.
- Answer only `GET` and `HEAD`.
- Markdown pages carry a Content-Security-Policy that lets only btk's own scripts run, so scripts in a document don't.

## Consequences

- Pages that need scripts get them through plugins that declare them ([ADR-011](ADR-011-mermaid-plugin.md)).
- `btk serve` injects its reload script into the user's own HTML, and pages with a strict CSP block it; that stays an open question in the roadmap.
