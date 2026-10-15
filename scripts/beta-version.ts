/**
 * Prints the version for the next beta of a base version: one more than the highest `v<base>-beta.N` tag,
 * or `-beta.0` when there is none. Betas have no branch of their own, so their number comes from the tags.
 *
 *   bun scripts/beta-version.ts 0.2.0   # 0.2.0-beta.2 when v0.2.0-beta.0 and v0.2.0-beta.1 exist
 */

export function nextBeta(base: string, tags: readonly string[]): string {
  const prefix = `v${base}-beta.`;
  const numbers = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number(tag.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return `${base}-beta.${numbers.length > 0 ? Math.max(...numbers) + 1 : 0}`;
}

function remoteTags(): string[] {
  const result = Bun.spawnSync(["git", "ls-remote", "--tags", "--refs", "origin"]);
  if (result.exitCode !== 0) throw new Error(`git ls-remote failed: ${result.stderr.toString().trim()}`);
  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.split("refs/tags/")[1])
    .filter((tag): tag is string => Boolean(tag));
}

if (import.meta.main) {
  const base = Bun.argv[2];
  if (!base) throw new Error("Usage: bun scripts/beta-version.ts <base version>");
  console.log(nextBeta(base, remoteTags()));
}
