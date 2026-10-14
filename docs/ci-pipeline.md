# CI pipeline

Three GitHub Actions workflows live in `.github/workflows/`. They all pin Bun with `BUN_VERSION`, currently 1.4.0.

## test.yml

Runs on every pull request and every push to `master`. A new push to the same branch cancels the run in progress.

| Job | Runs on | Steps |
| --- | --- | --- |
| `check` | Ubuntu | `bun install --frozen-lockfile`, then `bun run check` (Biome, oxlint, tsc) |
| `test` | Ubuntu, macOS, Windows | `bun install --frozen-lockfile`, `bun test`, then `bun run test:dist`, which builds the binary for that runner and runs the end-to-end suite against it |

## release.yml

Runs when you push a tag that starts with `v`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

| Job | Needs | What it does |
| --- | --- | --- |
| `checks` | | Fails unless the tag matches `package.json` (`v0.1.0` for version `0.1.0`), then runs `bun run check` and `bun test` |
| `build` | `checks` | Builds the five binaries with `scripts/build.ts`, runs the end-to-end suite against the ones its runner can execute, and uploads each as an artifact |
| `release` | `build` | Writes `SHA256SUMS` with `btk hash`, creates the GitHub Release with generated notes, downloads the published files again and runs `btk hash check SHA256SUMS` on them |
| `homebrew` | `release` | Runs `homebrew.yml` for the new tag |

The build matrix:

| Binary | Runner | End-to-end tests |
| --- | --- | --- |
| `btk-darwin-arm64` | `macos-latest` | yes |
| `btk-darwin-x64` | `macos-latest`, cross-compiled | no |
| `btk-linux-x64` | `ubuntu-latest` | yes |
| `btk-linux-arm64` | `ubuntu-latest`, cross-compiled | no |
| `btk-windows-x64.exe` | `windows-latest` | yes |

The two cross-compiled binaries aren't run in CI, because they target a different CPU than the runner that builds them. Adding an Intel macOS runner and a Linux ARM runner would cover them.

## homebrew.yml

Writes `Formula/bun-toolkit.rb` for one release tag and commits it to `master`. `release.yml` runs it after every release, and you can run it by hand for an existing tag:

```bash
gh workflow run homebrew.yml -f tag=v0.1.0
```

This repository is also the Homebrew tap, so the formula lives here. The workflow rewrites it every time, so never edit it by hand. It runs `scripts/homebrew-formula.ts` from the tagged commit, so it also works for a tag whose branch isn't merged.

The workflow checks the repository's visibility each time it runs:

- **Private.** GitHub serves release files only through its API, with a token. The formula downloads through `api.github.com` and sends `HOMEBREW_GITHUB_API_TOKEN` when it's set. `brew tap` clones the repository with your git credentials. A fine-grained token with read access to this repository's contents works as well as `gh auth token`.
- **Public.** The formula uses plain release download URLs, and nobody needs a token.

After switching the repository to public, run the workflow once for the latest tag, so the formula stops using the API. The steps are in [distribution.md](distribution.md#going-public).

## Secrets

No workflow needs a secret yet. They all use the built-in `GITHUB_TOKEN`. `homebrew.yml` pushes to `master` with it, so a branch protection rule on `master` must allow GitHub Actions to push.

npm publishing comes once the repository is public. It will publish `@bun-toolkit/cli` and the `@bun-toolkit/<platform>` packages, and needs either an `NPM_TOKEN` secret or npm trusted publishing (see [distribution.md](distribution.md)).

## Build flags

Every compiled binary goes through `scripts/build.ts`:

```typescript
await Bun.build({
  entrypoints: ["./bin/btk.ts"],
  compile: { outfile, target },
  minify: true,
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [stubDevtools],   // Ink's dev-only react-devtools-core import
});
```

The build skips `--bytecode` because Ink and yoga-layout use top-level await, which bytecode compilation rejects (see [distribution.md](distribution.md)). The entrypoint still avoids top-level await, so we can turn bytecode back on if that changes.

## Later

A nightly workflow against Bun canary would catch a breaking Bun change before a release. It isn't built yet.
