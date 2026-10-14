# Releasing

bun-toolkit uses [Changesets](https://github.com/changesets/changesets) to version releases and write `CHANGELOG.md`. You run one command to turn the pending changesets into a version, then push. CI does the rest: it tags the commit, builds the binaries, publishes the GitHub Release and updates Homebrew. You never edit the version in `package.json`, tag a commit or create a release by hand. [ci-pipeline.md](ci-pipeline.md) has the workflow details.

| Channel | Branch | Versions | Homebrew formula |
| --- | --- | --- | --- |
| Stable | `master` | `0.2.0` | `bun-toolkit` |
| Beta | `beta` | `0.2.0-beta.1` | `bun-toolkit-beta` |

## Describe your change

Every pull request that changes what users see needs a changeset:

```bash
bunx changeset
```

Pick the bump, then write one or two sentences for the changelog:

| Bump | Use it for |
| --- | --- |
| `patch` | Bug fixes and small corrections |
| `minor` | New commands, flags, config keys or tools |
| `major` | Changes that break existing commands, flags or configs |

Before 1.0, use `minor` for breaking changes too.

The command writes a Markdown file to `.changeset/`. Commit it with your change. Write the summary for users, for example: "`btk hash check` reads BSD-style checksum lines". For changes users don't see, such as a refactor or a docs typo, skip the changeset.

## Cut a release

The same steps work on `master` (stable) and `beta` (pre-releases):

1. Merge the pull requests with changesets, then pull the branch.
2. Turn the changesets into a version:

   ```bash
   bun run release:version
   ```

   This runs `changeset version`: it bumps `package.json`, writes the `CHANGELOG.md` entry and deletes the consumed changesets. The changelog links each entry to its pull request and author through the GitHub API, so the command uses `GITHUB_TOKEN` or your `gh` login, and refuses to run while you have unpushed commits.
3. Review `CHANGELOG.md` and reword it if needed, then commit and push:

   ```bash
   git add -A && git commit -m "Release v0.2.0" && git push
   ```

The push runs `release.yml` on `master` or `prerelease.yml` on `beta`. It sees a version without a tag, then builds the binaries, creates the tag with a GitHub Release whose notes are the changelog entry, and updates the Homebrew formula. Pushes that don't change the version publish nothing.

## Pre-releases on the beta channel

The `beta` branch stays in Changesets pre mode, so every version from it is a pre-release such as `0.2.0-beta.1`. `prerelease.yml` publishes it as a GitHub pre-release and updates `Formula/bun-toolkit-beta.rb`. Stable users never get it.

**Start a beta cycle.** Do this once per cycle:

```bash
git checkout master && git pull
git checkout -b beta
bunx changeset pre enter beta
git add .changeset/pre.json && git commit -m "Enter beta pre-release mode"
git push -u origin beta
```

**Ship betas.** Open pull requests against `beta`, each with a changeset. When you want a beta out, run `bun run release:version` on `beta`, then commit and push. Each run produces the next number: `-beta.0`, `-beta.1`, and so on.

**Finish the cycle.** Leave pre mode on `beta`, then merge `beta` into `master`:

```bash
git checkout beta && git pull
bunx changeset pre exit
git add .changeset/pre.json && git commit -m "Exit beta pre-release mode" && git push
```

Open a pull request from `beta` into `master` and merge it. Then run `bun run release:version` on `master`, which turns the beta's changesets into the stable entry, such as `0.2.0`. Commit and push, then delete the `beta` branch.

`-alpha.N` and `-rc.N` work the same way with `bunx changeset pre enter alpha` or `pre enter rc`. They all publish to `bun-toolkit-beta`.

## Install a beta

```bash
brew uninstall bun-toolkit
brew install davidpn11/bun-toolkit/bun-toolkit-beta
```

Back to stable:

```bash
brew uninstall bun-toolkit-beta
brew install davidpn11/bun-toolkit/bun-toolkit
```

## When something goes wrong

- **A release job failed.** The tag is only created together with the release, so nothing is half-published. Fix the problem and re-run the failed jobs, or push again.
- **The formula is wrong or outdated.** Rewrite it from an existing release: `gh workflow run homebrew.yml -f tag=v0.2.0`.
- **The channel check fails.** `master` holds a pre-release version, or `beta` a stable one. This usually means `beta` was merged without `changeset pre exit`, or pre mode was entered on `master`. Fix `.changeset/pre.json`, then push again.
