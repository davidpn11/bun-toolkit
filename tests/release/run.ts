/**
 * `bun run release:try [stable|beta] [-- command...]`
 * `bun run` drops a leading `--`, so a command needs the channel before it: `stable -- btk info`.
 *
 * Installs the published release in a fresh Homebrew container, checks it, then opens a shell (or
 * runs the command). The container is removed when the shell exits. Uses Podman when it's
 * installed, otherwise Docker; BTK_CONTAINER_ENGINE picks one. See docs/testing.md.
 */

import { existsSync } from "node:fs";

export type Channel = "stable" | "beta";
export type Engine = "podman" | "docker";

export type TryOptions = {
  channel: Channel;
  command: string[];
};

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

function runContainer(engine: Engine, options: TryOptions): number {
  const interactive = options.command.length === 0 ? ["-it"] : [];
  const command = options.command.length > 0 ? ["--", ...options.command] : [];
  const args = ["run", "--rm", ...interactive, ...assetsMount(), IMAGE, options.channel, ...command];
  return run(engine, args);
}

function main(): void {
  try {
    const options = parseTryArgs(Bun.argv.slice(2));
    const engine = pickEngine(process.env.BTK_CONTAINER_ENGINE, (name) => Bun.which(name) !== null);
    requireRunning(engine);
    buildImage(engine);
    const code = runContainer(engine, options);
    if (code === 0 && options.command.length === 0) console.log("\x1b[2mContainer removed.\x1b[0m");
    process.exit(code);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

if (import.meta.main) main();
