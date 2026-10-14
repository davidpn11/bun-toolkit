# CI pipeline

Five GitHub Actions workflows live in `.github/workflows/`. They all pin Bun with `BUN_VERSION`, currently 1.4.0. [releasing.md](releasing.md) covers the release process from a contributor's side.

| Workflow | Trigger | Job |
| --- | --- | --- |
| `test.yml` | pull requests, pushes to `master` and `beta` | Lint and test on three operating systems |
| `release.yml` | pushes to `master` | Runs `publish.yml` for the stable channel |
| `prerelease.yml` | pushes to `beta` | Runs `publish.yml` for the beta channel |
| `publish.yml` | called by the two above | The Version PR, then build, release and Homebrew |
| `homebrew.yml` | called by `publish.yml`, or by hand | Writes the Homebrew formula for one release |

## test.yml

A new push to the same branch cancels the run in progress.

| Job | Runs on | Steps |
| --- | --- | --- |
| `check` | Ubuntu | `bun install --frozen-lockfile`, then `bun run check` (Biome, oxlint, tsc) |
| `test` | Ubuntu, macOS, Windows | `bun install --frozen-lockfile`, `bun test`, then `bun run test:dist`, which builds the binary for that runner and runs the end-to-end suite against it |

## publish.yml

`release.yml` calls it with `channel: stable` and `prerelease.yml` with `channel: beta`. Every push to those branches runs it, but most pushes stop after the first job.

| Job | Runs when | What it does |
| --- | --- | --- |
| `plan` | always | `changesets/action` opens or updates the "Version Packages" PR when the branch has changesets. With none, it checks whether `package.json` holds a version without a tag. If so, it checks that a `-` suffix matches the channel and that `CHANGELOG.md` has an entry, then outputs the tag. |
| `checks` | a tag is planned | `bun run check` and `bun test` |
| `build` | after `checks` | Builds the five binaries with `scripts/build.ts`, runs the end-to-end suite against the ones its runner can execute, and uploads each as an artifact |
| `release` | after `build` | Writes `SHA256SUMS` with `btk hash`. Creates the tag and the GitHub Release on the same commit, with the changelog entry as notes and `--prerelease` on the beta channel. Then downloads the published files and runs `btk hash check SHA256SUMS` on them |
| `homebrew` | after `release` | Runs `homebrew.yml` for the new tag |

The tag is created in the `release` job, together with the release. If a build fails, no tag exists, so the next push to the branch tries again.

The build matrix:

| Binary | Runner | End-to-end tests |
| --- | --- | --- |
| `btk-darwin-arm64` | `macos-latest` | yes |
| `btk-darwin-x64` | `macos-latest`, cross-compiled | no |
| `btk-linux-x64` | `ubuntu-latest` | yes |
| `btk-linux-arm64` | `ubuntu-latest`, cross-compiled | no |
| `btk-windows-x64.exe` | `windows-latest` | yes |

The two cross-compiled binaries aren't run in CI, because they target a different CPU than the runner that builds them.

## homebrew.yml

Writes the formula for one release tag and commits it to `master`, the branch Homebrew reads. It checks out `master` and runs `scripts/homebrew-formula.ts` from there, so it works for any tag, including tags from `beta`.

The version decides the formula. A version with a `-` suffix, such as `0.2.0-beta.1`, writes `Formula/bun-toolkit-beta.rb`. Anything else writes `Formula/bun-toolkit.rb`. Both download the plain release URLs and conflict with each other, because both install `btk`. Never edit them by hand, because the next release overwrites them.

To rewrite a formula without a release:

```bash
gh workflow run homebrew.yml -f tag=v0.1.0
```

## Permissions

No workflow needs a secret. They all use the built-in `GITHUB_TOKEN`:

- `publish.yml` needs **Allow GitHub Actions to create and approve pull requests**, under Settings, Actions, General, to open the Version PR.
- `homebrew.yml` pushes to `master`, so a branch protection rule on `master` must allow GitHub Actions to push.
- GitHub doesn't start workflows from actions taken with `GITHUB_TOKEN`. So `test.yml` doesn't run on the Version PR, and the formula commit doesn't start `release.yml` again.

npm publishing comes later. It will publish `@bun-toolkit/cli` and the `@bun-toolkit/<platform>` packages, and needs either an `NPM_TOKEN` secret or npm trusted publishing (see [distribution.md](distribution.md)).

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
