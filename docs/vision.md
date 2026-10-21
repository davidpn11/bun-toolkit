# Vision

## What bun-toolkit is

bun-toolkit is one CLI that turns Bun's native APIs into developer tools, with one install, one command name and one output style.

Bun ships native APIs for image encoding, password hashing, compression, format parsing, cryptographic hashing and markdown rendering. They are fast and need no dependencies, but few people use them outside their own code. bun-toolkit makes each API a CLI command with config, batch processing, progress reporting and consistent output.

## Naming

- Project name: `bun-toolkit`
- CLI command: `btk`, with `bun-toolkit` as a longer alias
- npm package: `@bun-toolkit/cli`, in the `bun-toolkit` npm org, because the unscoped name and the `@btk` scope belong to others ([ADR-007](adr/ADR-007-homebrew-before-npm.md))
- Platform packages: `@bun-toolkit/darwin-arm64`, `@bun-toolkit/linux-x64` and so on
- The documentation, website and GitHub repo all use `bun-toolkit`

## Commands

```
btk image ./assets --format webp --quality 80
btk convert config.yaml --to json
btk hash sha256 package.tar.gz
btk compress --zstd --level 9 bundle.js
btk password hash "s3cret"
btk md preview README.md
btk ui
```

Each command uses Bun's native APIs, so you don't need sharp, ImageMagick, openssl, jq or yq. The compiled binary is self-contained. You can install it globally, add it as a devDependency, or run it with `npx`.

## Three contexts, one codebase

People always use bun-toolkit through the CLI, never as a library import.

In a terminal, which is the main target, output has colors, icons, spinners, progress bars and aligned tables.

In CI pipelines the commands stay the same and only the output changes. bun-toolkit detects `CI=true` or a non-TTY environment and prints plain text. Run it with `npx bun-toolkit image ./assets`, or add it as a devDependency and call `btk` from npm scripts the way you would call changesets or lint-staged.

For AI agents, `AGENT=true` or `--json` makes every command print one JSON document that the agent can parse.

## Why no programmatic API

`import { Image } from "bun"` already exists, so the raw Bun APIs are the library. bun-toolkit adds what a library doesn't give you: config, batch processing, progress reporting, output formatting and piping between commands.

## Principles

- A solid foundation matters more than the number of tools.
- Build one tool at a time, each on that foundation.
- Every command uses the same visual language.
- btk decides the output mode once, at startup. Tool code never checks it.
