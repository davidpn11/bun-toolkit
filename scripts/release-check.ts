/**
 * Explains what merging a pull request into master will release, for the PR's job summary. It never fails
 * the check: a missing version only gets a warning with the commands to run.
 *
 *   bun scripts/release-check.ts master   # compares HEAD with origin/master
 */
import { changelogSection } from "./changelog-section.ts";

export type ReleaseState = {
  baseVersion: string;
  headVersion: string;
  pending: number;
  changedFiles: string[];
  tagged: boolean;
  changelog: string | undefined;
  branch: string;
};

export type ReleaseCheck = {
  level: "notice" | "warning";
  title: string;
  summary: string;
};

const SHIPPED = /^(src|bin)\//;

export function releaseCheck(state: ReleaseState): ReleaseCheck {
  if (state.headVersion.includes("-")) return prereleaseOnBranch(state);
  if (state.pending > 0) return notVersioned(state);
  const bumped = Bun.semver.order(state.headVersion, state.baseVersion) === 1;
  if (bumped && state.tagged) return alreadyReleased(state);
  if (bumped) return releases(state);
  if (state.headVersion !== state.baseVersion) return versionWentBack(state);
  if (state.changedFiles.some((file) => SHIPPED.test(file))) return missingChangeset(state);
  return {
    level: "notice",
    title: "Nothing to release",
    summary: `## Nothing to release\n\nThis PR doesn't change the CLI, and the version stays at \`${state.baseVersion}\`.\n`,
  };
}

function releases(state: ReleaseState): ReleaseCheck {
  const notes = state.changelog ? `\n### Release notes\n\n${state.changelog}\n` : "";
  return {
    level: "notice",
    title: `Merging releases v${state.headVersion}`,
    summary: `## :rocket: Merging releases v${state.headVersion}\n\nThe version goes from \`${state.baseVersion}\` to \`${state.headVersion}\`. After the merge, the Release workflow builds the binaries, tags \`v${state.headVersion}\` and updates the \`bun-toolkit\` formula.\n${notes}${betaHint(state)}`,
  };
}

function notVersioned(state: ReleaseState): ReleaseCheck {
  const what = state.pending === 1 ? "1 changeset is" : `${state.pending} changesets are`;
  return {
    level: "warning",
    title: "Not versioned yet",
    summary: `## :warning: Not versioned yet\n\n${what} waiting, so merging this PR as it is releases nothing. To release on merge:\n\n1. On \`${state.branch}\`, run \`bun run release:version\`. It bumps \`package.json\`, writes the \`CHANGELOG.md\` entry and deletes the changesets.\n2. Review \`CHANGELOG.md\`, then commit and push.\n\nThis check then says which version merging releases.\n${betaHint(state)}`,
  };
}

function missingChangeset(state: ReleaseState): ReleaseCheck {
  return {
    level: "warning",
    title: "No changeset",
    summary: `## :warning: No changeset\n\nThis PR changes the CLI but has no changeset, so merging it releases nothing and the change misses the changelog. If users will notice it:\n\n1. Run \`bun changeset\`, pick the bump and describe the change.\n2. Run \`bun run release:version\`, then commit and push.\n\nSkip this for changes users don't see, such as a refactor.\n`,
  };
}

function alreadyReleased(state: ReleaseState): ReleaseCheck {
  return {
    level: "warning",
    title: `v${state.headVersion} is already released`,
    summary: `## :warning: v${state.headVersion} is already released\n\nA tag for \`v${state.headVersion}\` exists, so merging publishes nothing. Add a changeset with \`bun changeset\`, run \`bun run release:version\` again, then commit and push.\n`,
  };
}

function versionWentBack(state: ReleaseState): ReleaseCheck {
  return {
    level: "warning",
    title: "The version went backwards",
    summary: `## :warning: The version went backwards\n\n\`package.json\` says \`${state.headVersion}\`, but master is already at \`${state.baseVersion}\`. Merge master into \`${state.branch}\`, then run \`bun run release:version\` again.\n`,
  };
}

function prereleaseOnBranch(state: ReleaseState): ReleaseCheck {
  return {
    level: "warning",
    title: "A beta version on the way to master",
    summary: `## :warning: A beta version on the way to master\n\n\`package.json\` says \`${state.headVersion}\`. Master only releases stable versions, and betas get their number when they're published. If \`.changeset/pre.json\` exists, run \`bun changeset pre exit\`. Then run \`bun run release:version\` again, and commit and push.\n`,
  };
}

function betaHint(state: ReleaseState): string {
  return `\n### Try it first\n\nPublish a beta of this branch: **Actions → Publish beta → Run workflow** on \`${state.branch}\`, or \`gh workflow run beta.yml --ref ${shellQuote(state.branch)}\`. Install it with \`brew install davidpn11/bun-toolkit/bun-toolkit-beta\`, or check it with \`bun run release:try beta\`.\n`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args]);
  if (result.exitCode !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}

async function readState(base: string): Promise<ReleaseState> {
  const headVersion = ((await Bun.file("package.json").json()) as { version: string }).version;
  const pending = [...new Bun.Glob("*.md").scanSync(".changeset")].filter(
    (name) => name !== "README.md",
  ).length;
  const changelog = await Bun.file("CHANGELOG.md")
    .text()
    .catch(() => "");
  return {
    baseVersion: (JSON.parse(git("show", `origin/${base}:package.json`)) as { version: string }).version,
    headVersion,
    pending,
    changedFiles: git("diff", "--name-only", `origin/${base}...HEAD`).split("\n").filter(Boolean),
    tagged: git("ls-remote", "--tags", "origin", `refs/tags/v${headVersion}`) !== "",
    changelog: changelogSection(changelog, headVersion),
    branch: process.env.GITHUB_HEAD_REF || git("branch", "--show-current"),
  };
}

async function main(): Promise<void> {
  const check = releaseCheck(await readState(Bun.argv[2] ?? "master"));
  console.log(`::${check.level} title=Release check::${check.title}`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath)
    await Bun.write(
      summaryPath,
      `${await Bun.file(summaryPath)
        .text()
        .catch(() => "")}${check.summary}`,
    );
  else console.log(`\n${check.summary}`);
}

if (import.meta.main) await main();
