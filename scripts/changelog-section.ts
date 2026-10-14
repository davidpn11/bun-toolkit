/**
 * Prints one version's section of CHANGELOG.md, which the publish workflow uses as release notes.
 * Exits 1 when the version has no entry, so a release never goes out without one.
 *
 *   bun scripts/changelog-section.ts 0.2.0 > notes.md
 */

export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return undefined;
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const body = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join("\n")
    .trim();
  return body || undefined;
}

async function main(): Promise<void> {
  const version = Bun.argv[2];
  if (!version) throw new Error("Usage: bun scripts/changelog-section.ts <version>");
  const section = changelogSection(await Bun.file("CHANGELOG.md").text(), version);
  if (!section) {
    console.error(`CHANGELOG.md has no entry for ${version}. Add a changeset and merge the Version PR first.`);
    process.exit(1);
  }
  process.stdout.write(`${section}\n`);
}

if (import.meta.main) await main();
