# ADR-008: A Fumadocs site that reads docs/ in place

- **Status:** Accepted
- **Decided in:** Phase 7
- **More in:** [roadmap.md](../roadmap.md#phase-7-documentation-site-done)

## Context

The docs live as markdown in `docs/` and must read well on GitHub. Users also need a searchable site.

## Decision

- The site is a Next.js app with Fumadocs in `website/`, outside the root workspace, exported as static files.
- It reads `docs/` as it is, with no frontmatter. `website/lib/pages.ts` lists the published pages; contributor pages, including these ADRs, stay on GitHub.
- Relative links work on GitHub and are rewritten to site routes at build time. A link to a missing file fails the build.

## Consequences

- One copy of every page. Renaming a published file changes its URL, so published pages keep their names.
- `btk md serve docs` previews the same files locally.
