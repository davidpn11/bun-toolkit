/**
 * Sets `version` in package.json, which the binary reports as `btk --version`. Beta builds use it on a
 * throwaway checkout; it is never committed.
 *
 *   bun scripts/set-version.ts 0.2.0-beta.2
 */

const version = Bun.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  throw new Error("Usage: bun scripts/set-version.ts <version>, such as 0.2.0-beta.2");
}
const pkg = (await Bun.file("package.json").json()) as { version: string };
pkg.version = version;
await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
