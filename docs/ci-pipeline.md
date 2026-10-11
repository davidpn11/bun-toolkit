# CI pipeline

Two GitHub Actions workflows live in `.github/workflows/`. Both pin Bun with `BUN_VERSION`, currently 1.4.0.

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
| `homebrew` | `release` | Generates `Formula/bun-toolkit.rb` with `scripts/homebrew-formula.ts` and commits it to `master` |

The build matrix:

| Binary | Runner | End-to-end tests |
| --- | --- | --- |
| `btk-darwin-arm64` | `macos-latest` | yes |
| `btk-darwin-x64` | `macos-latest`, cross-compiled | no |
| `btk-linux-x64` | `ubuntu-latest` | yes |
| `btk-linux-arm64` | `ubuntu-latest`, cross-compiled | no |
| `btk-windows-x64.exe` | `windows-latest` | yes |

The two cross-compiled binaries aren't run in CI, because they target a different CPU than the runner that builds them. Adding an Intel macOS runner and a Linux ARM runner would cover them.

## Homebrew

This repository is also the Homebrew tap. The formula lives in `Formula/bun-toolkit.rb`, and the `homebrew` job rewrites it after every release, so never edit it by hand.

While the repository is private, GitHub serves release files only through its API, with a token. The job notices that the repository is private and passes `--private` to the generator. The formula then downloads through `api.github.com` and sends `HOMEBREW_GITHUB_API_TOKEN`. Once the repository is public, the next release writes plain download URLs and no token is needed.

To install from the private repository:

```bash
export HOMEBREW_GITHUB_API_TOKEN=$(gh auth token)
brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit
brew install davidpn11/bun-toolkit/bun-toolkit
```

`brew tap` clones the repository with your git credentials, and the token lets Homebrew download the binary. A fine-grained token with read access to this repository's contents works as well as the `gh` token.

## Secrets

Neither workflow needs a secret yet. Both use the built-in `GITHUB_TOKEN`. The `homebrew` job pushes to `master` with it, so a branch protection rule on `master` must allow GitHub Actions to push.

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
