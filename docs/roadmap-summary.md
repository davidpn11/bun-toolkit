# Roadmap

Where btk is today and where it's heading. The [detailed roadmap](roadmap.md) has the full plan, phase by phase.

## Available now

- Seven tools: [image](tools/image.md), [hash](tools/hash.md), [convert](tools/convert.md), [password](tools/password.md), [compress](tools/compress.md) with `decompress`, [md](tools/md.md) for markdown previews and static sites, and [serve](tools/serve.md) for serving folders with live reload.
- A global config in `~/.bun-toolkit`, a project config in `btk.config.ts`, and `BTK_*` environment variables, so every tool runs with your defaults.
- [Themes and plugins](plugins.md), starting with `btk md`.
- Rich output in a terminal, plain text in CI, and JSON for scripts and agents.
- A dashboard for every tool with `btk ui`, and tab completion for zsh, bash and fish.
- Homebrew, binaries for macOS, Linux and Windows, and this documentation site.

## Coming next

- A more polished dashboard. Running `btk` on its own opens it, flows chain tools together (convert a file, then hash the result), and results stay in a session history.

## On the horizon

- New tools: `html` for transforming and scraping HTML, `color` for converting and previewing colors, `tar` for archives with glob filters, `transpile` for TypeScript and JSX, and `semver` for comparing versions.
- Interactive examples on this site.

Ideas and requests are welcome in [GitHub issues](https://github.com/davidpn11/bun-toolkit/issues).
