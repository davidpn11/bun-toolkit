# CI pipeline

Seven GitHub Actions workflows live in `.github/workflows/`. They all install the Bun version pinned as `packageManager` in `package.json`, currently 1.4.3, through `setup-bun`'s `bun-version-file`. Every step runs on Bun, and nothing installs Node. The only Node in CI is the runtime GitHub uses for the actions themselves: `actions/checkout@v7`, `actions/upload-artifact@v7`, `actions/download-artifact@v8` and `oven-sh/setup-bun@v2` all target Node 24. When GitHub deprecates a Node version, bump these to the major whose `action.yml` says `runs.using: node24` or later. `bunfig.toml` sets `[run] bun = true`, so tools with a `node` shebang, such as the Changesets CLI, run on Bun through `bun run` and `bun <tool>`. [releasing.md](releasing.md) covers the release process from a contributor's side.

| Workflow | Trigger | Job |
| --- | --- | --- |
| `test.yml` | pull requests, pushes to `master` | Lint and test on three operating systems |
| `release-check.yml` | pull requests into `master` | Writes what merging releases to the job summary, with instructions when the PR isn't versioned |
| `release.yml` | pushes to `master` | Runs `publish.yml` for the stable channel |
| `beta.yml` | by hand, on any branch | Runs `publish.yml` for the beta channel |
| `publish.yml` | called by the two above | Build, release and Homebrew, when the version is new |
| `homebrew.yml` | called by `publish.yml`, or by hand | Writes the Homebrew formula for one release |
| `pages.yml` | pull requests and pushes to `master` that touch `docs/` or `website/` | Builds the documentation site, and deploys it to GitHub Pages from `master` |

## test.yml

A new push to the same branch cancels the run in progress.

| Job | Runs on | Steps |
| --- | --- | --- |
| `check` | Ubuntu | `bun install --frozen-lockfile`, then `bun run check` (Biome, oxlint, `bun --check`) |
| `test` | Ubuntu, macOS, Windows | `bun install --frozen-lockfile`, `bun test`, then `bun run test:dist`, which builds the binary for that runner and runs the end-to-end suite against it |

## release-check.yml

Runs `scripts/release-check.ts` on every pull request into `master`. It compares the PR's `package.json` version with master's, counts the changesets that haven't been versioned, and checks whether the version is already tagged. It then writes the result to the job summary, with the commands to run when something is missing ([releasing.md](releasing.md#the-release-check) lists the cases). It reports a notice or a warning and never fails, so it doesn't block a merge.

## publish.yml

`release.yml` calls it with `channel: stable` on every push to `master`. Only a push that changes the version in `package.json` publishes; you make that change on your branch with `bun run release:version` before merging (see [releasing.md](releasing.md)). `beta.yml` calls it with `channel: beta`, on the branch you run it on.

| Job | Runs when | What it does |
| --- | --- | --- |
| `plan` | always | **Stable:** refuses to run outside `master`, checks whether `package.json` holds a version without a tag, rejects a pre-release version, and reads the `CHANGELOG.md` entry. Without a new version it publishes nothing, and warns in the summary when changesets were merged without one. **Beta:** on a throwaway checkout, runs `changeset version` when changesets are pending to get the base version, then `scripts/beta-version.ts` picks the next `-beta.N` from the existing tags. It outputs the tag, the version and the release notes. |
| `checks` | a tag is planned | `bun run check` and `bun test` |
| `build` | after `checks` | On the beta channel, stamps the beta version into `package.json` with `scripts/set-version.ts` so `btk --version` reports it. Builds the five binaries with `scripts/build.ts`, runs the end-to-end suite against the ones its runner can execute, and uploads each as an artifact |
| `release` | after `build` | Writes `SHA256SUMS` with `btk hash`. Creates the tag and the GitHub Release on the commit being built, with the notes from `plan` and `--prerelease` on the beta channel. Then downloads the published files and runs `btk hash check SHA256SUMS` on them |
| `homebrew` | after `release` | Runs `homebrew.yml` for the new tag |

The tag is created in the `release` job, together with the release. If a build fails, no tag exists, so the next push (or the next beta run) tries again. `beta.yml` runs one at a time, so two betas never get the same number.

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

Writes the formula for one release tag and commits it to `master`, the branch Homebrew reads. It runs `scripts/homebrew-formula.ts` from the commit that started the workflow, and writes the result into a second checkout of `master`. A beta published from `beta` therefore uses `beta`'s script, and a manual run uses `master`'s.

The version decides the formula. A version with a `-` suffix, such as `0.2.0-beta.1`, writes `Formula/bun-toolkit-beta.rb`. Anything else writes `Formula/bun-toolkit.rb`. Both download the plain release URLs and conflict with each other, because both install `btk`. Never edit them by hand, because the next release overwrites them.

To rewrite a formula without a release:

```bash
gh workflow run homebrew.yml -f tag=v0.1.0
```

## Permissions

No workflow needs a secret. They all use the built-in `GITHUB_TOKEN`:

- `homebrew.yml` pushes to `master`, so a branch protection rule on `master` must allow GitHub Actions to push.
- GitHub doesn't start workflows from pushes made with `GITHUB_TOKEN`, so the formula commit doesn't start `release.yml` again.

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

The build compiles to ESM bytecode, so the binaries start about twice as fast (see [distribution.md](distribution.md)).

## Later

A nightly workflow against Bun canary would catch a breaking Bun change before a release. It isn't built yet.
