/**
 * `bun run release:try [stable|beta] [-- command...]`
 * `bun run` drops a leading `--`, so a command needs the channel before it: `stable -- btk info`.
 *
 * Asks GitHub which release is the latest on the channel, and for stable, warns when master has changes
 * that aren't released yet. Then installs the published release in a fresh Homebrew container, checks that
 * it is that latest release, and opens a shell (or runs the command). The container is removed when the shell exits. Uses Podman when it's
 * installed, otherwise Docker; BTK_CONTAINER_ENGINE picks one. See docs/testing.md.
 */

import { existsSync } from "node:fs";

export type Channel = "stable" | "beta";
export type Engine = "podman" | "docker";

export type TryOptions = {
  channel: Channel;
  command: string[];
};

export type ChannelStatus = {
  /** Latest published version on the channel, without the `v`. */
  published: string | undefined;
  /** `package.json` version on master; stable only, since betas come from any branch. */
  masterVersion?: string;
  pending: number;
};

/** Resolves to undefined when the URL doesn't exist, such as a branch without a `.changeset` folder. */
export type FetchJson = (url: string) => Promise<unknown>;

type Release = { tag_name: string; prerelease: boolean; draft: boolean };
type DirEntry = { name: string; type: string };

const REPO = "davidpn11/bun-toolkit";

const USAGE =
  "Usage: bun run release:try [stable|beta] [-- command...]. To run a command, name the channel first, as in: bun run release:try stable -- btk info";

export function parseTryArgs(args: readonly string[]): TryOptions {
  const separator = args.indexOf("--");
  const own = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const options: TryOptions = { channel: "stable", command };
  for (const arg of own) {
    if (arg === "stable" || arg === "beta") options.channel = arg;
    else throw new Error(`Unknown argument "${arg}". ${USAGE}`);
  }
  return options;
}

export function pickEngine(override: string | undefined, installed: (name: Engine) => boolean): Engine {
  if (override === "podman" || override === "docker") return override;
  if (override) throw new Error(`BTK_CONTAINER_ENGINE must be podman or docker, not "${override}".`);
  if (installed("podman")) return "podman";
  if (installed("docker")) return "docker";
  throw new Error("Install Podman (brew install podman) or Docker to try a release in a container.");
}

export async function channelStatus(channel: Channel, fetchJson: FetchJson): Promise<ChannelStatus> {
  const releases = (await fetchJson(
    `https://api.github.com/repos/${REPO}/releases?per_page=30`,
  )) as Release[];
  const latest = releases.find((release) => !release.draft && release.prerelease === (channel === "beta"));
  const published = latest?.tag_name.replace(/^v/, "");
  if (channel === "beta") return { published, pending: 0 };
  const [pkg, changesets] = await Promise.all([
    fetchJson(`https://raw.githubusercontent.com/${REPO}/master/package.json`) as Promise<{
      version: string;
    }>,
    fetchJson(`https://api.github.com/repos/${REPO}/contents/.changeset?ref=master`) as Promise<
      DirEntry[] | undefined
    >,
  ]);
  const pending = (changesets ?? []).filter(
    (e) => e.type === "file" && e.name.endsWith(".md") && e.name !== "README.md",
  ).length;
  return { published, masterVersion: pkg.version, pending };
}

export function describeStatus(
  channel: Channel,
  status: ChannelStatus,
): { info: string[]; warnings: string[] } {
  const info = [
    status.published ? `Latest ${channel} release: v${status.published}` : `No ${channel} release yet`,
  ];
  if (status.masterVersion && status.masterVersion !== status.published) {
    return {
      info,
      warnings: [
        `master is at v${status.masterVersion}, which isn't released yet. Check the Release workflow run on master; it may still be running or may have failed.`,
      ],
    };
  }
  if (status.pending > 0) {
    const what = status.pending === 1 ? "1 changeset was" : `${status.pending} changesets were`;
    return {
      info,
      warnings: [
        `${what} merged into master without a version, so no release includes them. Run bun run release:version on a branch and open a PR.`,
      ],
    };
  }
  return { info, warnings: [] };
}

async function fetchGitHubJson(url: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.json();
}

async function checkChannel(channel: Channel): Promise<string | undefined> {
  try {
    const status = await channelStatus(channel, fetchGitHubJson);
    const { info, warnings } = describeStatus(channel, status);
    for (const line of info) console.log(line);
    for (const line of warnings) console.warn(`\x1b[33m⚠ ${line}\x1b[0m`);
    return status.published;
  } catch (error) {
    console.warn(
      `\x1b[33m⚠ Couldn't ask GitHub for the latest ${channel} release: ${(error as Error).message}\x1b[0m`,
    );
    return undefined;
  }
}

function run(engine: Engine, args: string[], quiet = false): number {
  const io = quiet ? "ignore" : "inherit";
  return Bun.spawnSync([engine, ...args], { stdio: [io, io, io] }).exitCode ?? 1;
}

function requireRunning(engine: Engine): void {
  if (run(engine, ["info"], true) === 0) return;
  const start = engine === "podman" ? "podman machine init && podman machine start" : "Start Docker Desktop";
  throw new Error(`${engine} isn't running. ${start}, then run this again.`);
}

const IMAGE = "btk-release-test";

function buildImage(engine: Engine): void {
  const dockerfile = `${import.meta.dir}/Dockerfile`;
  const built = run(engine, ["build", "-f", dockerfile, "-t", IMAGE, import.meta.dir]);
  if (built !== 0) throw new Error("The image failed to build.");
}

/** Your own files for manual testing, git-ignored. Mounted only when the folder exists. */
const ASSETS = `${import.meta.dir}/test_assets`;

function assetsMount(): string[] {
  return existsSync(ASSETS) ? ["-v", `${ASSETS}:/assets:ro`] : [];
}

function runContainer(engine: Engine, options: TryOptions, expected: string | undefined): number {
  const interactive = options.command.length === 0 ? ["-it"] : [];
  const command = options.command.length > 0 ? ["--", ...options.command] : [];
  const env = expected ? ["-e", `BTK_EXPECTED_VERSION=${expected}`] : [];
  const args = ["run", "--rm", ...interactive, ...env, ...assetsMount(), IMAGE, options.channel, ...command];
  return run(engine, args);
}

async function main(): Promise<void> {
  try {
    const options = parseTryArgs(Bun.argv.slice(2));
    const engine = pickEngine(process.env.BTK_CONTAINER_ENGINE, (name) => Bun.which(name) !== null);
    const expected = await checkChannel(options.channel);
    requireRunning(engine);
    buildImage(engine);
    const code = runContainer(engine, options, expected);
    if (code === 0 && options.command.length === 0) console.log("\x1b[2mContainer removed.\x1b[0m");
    process.exit(code);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

if (import.meta.main) await main();
