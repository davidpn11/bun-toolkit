# ADR-001: One compiled binary on Bun's native APIs

- **Status:** Accepted
- **Decided in:** Phase 0
- **More in:** [vision.md](../vision.md), [getting-started.md](../getting-started.md#bun-version)

## Context

Bun ships fast native APIs for images, hashing, compression, format parsing, passwords and markdown, but few people use them outside their own code. The usual CLI alternatives each bring their own install: sharp, ImageMagick, openssl, jq, yq.

## Decision

- btk is one CLI built only on Bun's native APIs, compiled with `bun build --compile` into a single binary that carries its own Bun runtime.
- It has no programmatic API. `import { Image } from "bun"` already is the library; btk adds config, batches, progress and consistent output.
- Each release is built and tested on one exact Bun version, pinned as `packageManager` in `package.json`.

## Consequences

- Users need neither Bun nor Node, and upgrading btk upgrades the Bun it runs on.
- Every binary carries the runtime, so it is large (77 to 103 MB). Big optional features, such as Mermaid in [ADR-011](ADR-011-mermaid-plugin.md), go into plugins instead.
- A new Bun version means a btk release: move to it, adjust the commands whose behavior changed, update the docs.
