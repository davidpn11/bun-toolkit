/**
 * Turns the pending changesets into the next version and CHANGELOG.md entry (`bun run release:version`).
 * The changelog formatter links each entry to its pull request through the GitHub API, so this needs
 * a token (GITHUB_TOKEN, or the gh CLI's) and the changeset commits must already be on GitHub.
 */

function run(command: string[], env?: Record<string, string>): { code: number; stdout: string } {
  const result = Bun.spawnSync(command, { env: { ...process.env, ...env }, stderr: "inherit" });
  return { code: result.exitCode, stdout: result.stdout.toString().trim() };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
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

assertPushed();
const versioned = Bun.spawnSync(["bunx", "changeset", "version"], {
  env: { ...process.env, GITHUB_TOKEN: githubToken() },
  stdio: ["inherit", "inherit", "inherit"],
});
if (versioned.exitCode !== 0) process.exit(versioned.exitCode ?? 1);

const { version } = (await Bun.file("package.json").json()) as { version: string };
console.log(`\nVersion ${version}. Review CHANGELOG.md, then commit and push:
  git add -A && git commit -m "Release v${version}" && git push`);
