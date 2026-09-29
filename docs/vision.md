# Vision

## What bun-toolkit is

A single CLI that wraps Bun's native APIs into developer tools. One install, one command namespace, one output style.

Bun ships with native APIs for image encoding, password hashing, compression, format parsing, cryptographic hashing, and markdown rendering. Each one is fast, zero-dependency, and underused. bun-toolkit turns each API into a CLI command with configuration, batch processing, progress reporting, and consistent output.

## Naming

- Project name: `bun-toolkit`
- CLI command: `btk` (with `bun-toolkit` as a longer alias)
- npm package: `bun-toolkit`
- Platform packages: `@btk/darwin-arm64`, `@btk/linux-x64`, etc.
- Documentation, website, and GitHub repo all use `bun-toolkit`

## Commands

```
btk image optimize ./assets --format webp --quality 80
btk convert config.yaml --to json
btk hash sha256 package.tar.gz
btk compress --zstd --level 9 bundle.js
btk password hash "s3cret"
btk md preview README.md
btk ui
```

Each command uses Bun's native APIs. No sharp, no imagemagick, no openssl, no jq, no yq. The compiled binary is self-contained. Install globally, add as a devDependency, or run with `npx`.

## Three contexts, one codebase

Always through the CLI, never as a library import.

**Terminal** is the primary target. Colors, icons, spinners, progress bars, formatted output.

**CI/CD pipelines** get the same commands with adapted output. bun-toolkit detects `CI=true` or a non-TTY environment and switches to plain text. Run with `npx bun-toolkit image optimize` or add as a devDependency and call `btk` from npm scripts, like changesets or lint-staged.

**AI agents** get JSON output by default when `AGENT=true` is set, or when `--json` is passed. Agents run CLI commands and parse the JSON output.

## Why no programmatic API

`import { Image } from 'bun'` already exists. The raw Bun APIs are the library. bun-toolkit's value is the CLI layer on top: configuration, batch processing, progress reporting, output formatting, and piping between commands.

## Principles

- The foundation matters more than the feature count.
- One tool at a time, each on a solid base.
- Every command shares the same visual language.
- The output mode is a single decision at startup. Tool code never branches on context.
