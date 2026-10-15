# Releasing

bun-toolkit uses [Changesets](https://github.com/changesets/changesets) to version releases and write `CHANGELOG.md`. Everything happens in pull requests into `master`, the only release branch:

- **Stable:** version your branch before you merge, and the merge releases it.
- **Beta:** publish a beta of any branch whenever you want to try it.

CI tags the commit, builds the binaries, publishes the GitHub Release and updates Homebrew. You never tag a commit or create a release by hand. [ci-pipeline.md](ci-pipeline.md) has the workflow details.

| Channel | Comes from | Versions | Homebrew formula |
| --- | --- | --- | --- |
| Stable | merging a versioned PR into `master` | `0.2.0` | `bun-toolkit` |
| Beta | **Publish beta**, run on any branch | `0.2.0-beta.2` | `bun-toolkit-beta` |

## The short version

On your branch:

```bash
bun changeset                # describe the change
bun run release:version      # turn the changesets into the next version
git add -A && git commit -m "Release v0.2.0" && git push
```

Open the PR. Its **Release check** summary says "Merging releases v0.2.0". Merge it, and the Release workflow publishes `v0.2.0`.

To try it before merging, publish a beta of the branch:

```bash
gh workflow run beta.yml --ref your-branch
```

## Describe your change

Every pull request that changes what users see needs a changeset:

```bash
bun changeset
```

Pick the bump, then write one or two sentences for the changelog:

| Bump | Use it for |
| --- | --- |
| `patch` | Bug fixes and small corrections |
| `minor` | New commands, flags, config keys or tools |
| `major` | Changes that break existing commands, flags or configs |

Before 1.0, use `minor` for breaking changes too.

The command writes a Markdown file to `.changeset/`. Commit it with your change. Write the summary for users, for example: "`btk hash check` reads BSD-style checksum lines". For changes users don't see, such as a refactor or a docs typo, skip the changeset.

## Release on merge

1. On your branch, turn the changesets into a version:

   ```bash
   bun run release:version
   ```

   This runs `changeset version`: it bumps `package.json`, writes the `CHANGELOG.md` entry and deletes the consumed changesets. The changelog links each entry to its pull request and author through the GitHub API, so the command uses `GITHUB_TOKEN` or your `gh` login, and refuses to run while you have unpushed commits.
2. Review `CHANGELOG.md` and reword it if needed, then commit and push:

   ```bash
   git add -A && git commit -m "Release v0.2.0" && git push
   ```

3. Merge the PR. The push to `master` runs `release.yml`. It sees a version without a tag, then builds the binaries, creates the tag with a GitHub Release whose notes are the changelog entry, and updates the `bun-toolkit` formula.

You can merge several PRs that each carry a changeset and version them together later. Merging an unversioned PR releases nothing.

### The Release check

Every PR into `master` gets a **Release check** that writes what merging will do to the job summary. It never blocks the merge; it warns with the commands to run:

| Summary | What it means |
| --- | --- |
| Merging releases vX.Y.Z | The branch is versioned. The summary shows the release notes |
| Not versioned yet | Changesets are waiting. Run `bun run release:version`, then commit and push |
| No changeset | The PR changes `src/` or `bin/` without a changeset. Add one if users will notice |
| vX.Y.Z is already released | The version matches an existing tag. Add a changeset and version again |
| Nothing to release | Docs, tests or CI only |

## Betas

A beta is a build of a branch, published as a GitHub pre-release and through the `bun-toolkit-beta` formula. Stable users never get it. Publish one from the Actions tab (**Publish beta → Run workflow**, then pick the branch), or from the terminal:

```bash
gh workflow run beta.yml --ref your-branch
```

The workflow works out the version the same way a release would:

- **The base version.** With changesets on the branch, it runs `changeset version` on a throwaway checkout, so `0.1.0` plus a `minor` changeset gives `0.2.0`. A branch that is already versioned uses its `package.json` version. Nothing is committed back.
- **The beta number** comes from the existing tags: one more than the highest `v0.2.0-beta.N`, or `-beta.0` for a new base version.
- **The release** is tagged on the branch's latest commit, with the branch name and the changelog entry as notes. The `bun-toolkit-beta` formula then points at it.

Run it again after more pushes to get `-beta.3`, `-beta.4`, and so on. The run fails with "Nothing to publish" when the branch has no changesets and its version is already released.

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

`bun run release:try beta` installs the latest beta in a throwaway container instead (see [testing.md](testing.md#testing-a-published-release)).

## Moving to a new Bun version

btk follows every Bun release. To move to one:

1. Set `packageManager` in `package.json` to the new version, such as `"bun@1.5.0"`. CI picks it up from there.
2. Install it locally (`bun upgrade`), then run `bun run check`, `bun test` and `bun run test:dist`.
3. Read the Bun release notes. Fix commands whose behavior changed, and plan commands for new APIs.
4. Replace the version in the README and `docs/getting-started.md`. `src/version.test.ts` fails until they match.
5. Regenerate the banner with `bun scripts/mascot.ts --png`.
6. Add a changeset that says which Bun version btk moved to. `bun run release:version` writes "Built on Bun <version>." under the new changelog entry.

## When something goes wrong

- **A release job failed.** The tag is only created together with the release, so nothing is half-published. Fix the problem and re-run the failed jobs, or push again.
- **The formula is wrong or outdated.** Rewrite it from an existing release: `gh workflow run homebrew.yml -f tag=v0.2.0`.
- **Merged without versioning.** The Release workflow publishes nothing and shows a "Nothing published" warning with the number of waiting changesets. Run `bun run release:version` on a new branch, and open and merge a PR.
- **`release:version` refuses because of `.changeset/pre.json`.** Betas no longer use Changesets' pre-release mode, and that file would make a beta version. Run `bun changeset pre exit`, commit, then version again.
