/**
 * Turns the pending changesets into the next version and CHANGELOG.md entry (`bun run release:version`).
 * The changelog formatter links each entry to its pull request through the GitHub API, so this needs
 * a token (GITHUB_TOKEN, or the gh CLI's) and the changeset commits must already be on GitHub.
 */

import { existsSync } from "node:fs";
import { BUN_VERSION } from "../src/version.ts";

function run(command: string[], env?: Record<string, string>): { code: number; stdout: string } {
  const result = Bun.spawnSync(command, { env: { ...process.env, ...env }, stderr: "inherit" });
  return { code: result.exitCode, stdout: result.stdout.toString().trim() };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Betas come from the Publish beta workflow now, so Changesets' pre-release mode would only make wrong versions. */
export function preModeProblem(preMode: boolean): string | undefined {
  return preMode
    ? "This branch is in Changesets pre-release mode (.changeset/pre.json exists), which would make a beta version. Betas come from the Publish beta workflow now. Run: bun changeset pre exit"
    : undefined;
}

/** Names the Bun release under the version's heading, so the changelog and the release notes carry it. */
export function withBunVersion(changelog: string, version: string, bunVersion: string): string {
  const heading = `## ${version}\n`;
  const line = `Built on Bun ${bunVersion}.`;
  if (!changelog.includes(heading) || changelog.includes(`${heading}\n${line}`)) return changelog;
  return changelog.replace(heading, `${heading}\n${line}\n`);
}

function assertNotPreMode(): void {
  const problem = preModeProblem(existsSync(".changeset/pre.json"));
  if (problem) fail(problem);
}

function assertPushed(): void {
  const unpushed = run(["git", "rev-list", "--count", "@{upstream}..HEAD"]);
  if (unpushed.code !== 0) fail("This branch has no upstream. Push it first: git push -u origin HEAD");
  if (unpushed.stdout !== "0")
    fail("Push your commits first, so the changelog can link each changeset to them.");
}

function githubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const gh = run(["gh", "auth", "token"]);
  if (gh.code !== 0 || !gh.stdout) fail("Set GITHUB_TOKEN, or log in with: gh auth login");
  return gh.stdout;
}

async function versionPackages(): Promise<void> {
  assertNotPreMode();
  assertPushed();
  const versioned = Bun.spawnSync(["bun", "changeset", "version"], {
    env: { ...process.env, GITHUB_TOKEN: githubToken() },
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (versioned.exitCode !== 0) process.exit(versioned.exitCode ?? 1);

  const { version } = (await Bun.file("package.json").json()) as { version: string };
  const changelog = Bun.file("CHANGELOG.md");
  await Bun.write(changelog, withBunVersion(await changelog.text(), version, BUN_VERSION));
  console.log(`\nVersion ${version}. Review CHANGELOG.md, then commit and push:
  git add -A && git commit -m "Release v${version}" && git push`);
}

if (import.meta.main) await versionPackages();
