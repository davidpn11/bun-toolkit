import { chmodSync, realpathSync, renameSync, rmSync } from "node:fs";
import { defineCommand } from "../cli/define.ts";
import type { BtkContext } from "../context.ts";
import { BtkError } from "../errors.ts";
import { icons } from "../output/palette.ts";
import { describeFileError } from "../shared/fs.ts";

const REPO = "davidpn11/bun-toolkit";

export type InstallMethod =
  | { kind: "homebrew"; formula: string; path: string }
  | { kind: "binary"; path: string }
  | { kind: "source" };

export type UpdateResult = {
  method: InstallMethod["kind"];
  from: string;
  to: string;
  updated: boolean;
};

type Release = {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
};

export function detectInstall(execPath: string, main: string): InstallMethod {
  const cellar = execPath.match(/\/Cellar\/(bun-toolkit(?:-beta)?)\//);
  if (cellar?.[1]) return { kind: "homebrew", formula: cellar[1], path: execPath };
  // Compiled binaries run their entrypoint from Bun's embedded filesystem.
  return /\$bunfs|~BUN/.test(main) ? { kind: "binary", path: execPath } : { kind: "source" };
}

/** Homebrew's opt/ link always points at the formula's currently linked version. */
export function optPath(cellarPath: string): string {
  return cellarPath.replace(/\/Cellar\/([^/]+)\/[^/]+\//, "/opt/$1/");
}

export function assetName(platform: NodeJS.Platform, arch: string): string {
  return platform === "win32" ? `btk-windows-${arch}.exe` : `btk-${platform}-${arch}`;
}

export function expectedChecksum(sums: string, name: string): string | undefined {
  for (const line of sums.split("\n")) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (match?.[2] === name) return match[1];
  }
  return undefined;
}

async function request(url: string, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { signal, headers: { accept: "application/vnd.github+json" } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BtkError("Could not reach GitHub", {
      code: "ERR_UPDATE_NETWORK",
      hint: "Check your connection and try again",
      cause: error,
    });
  }
}

async function fetchLatest(prerelease: boolean, signal: AbortSignal): Promise<Release> {
  // releases/latest skips pre-releases, so betas take the newest release of any kind.
  const url = `https://api.github.com/repos/${REPO}/releases${prerelease ? "?per_page=1" : "/latest"}`;
  const res = await request(url, signal);
  if (!res.ok) {
    throw new BtkError(`Could not check for updates (GitHub answered ${res.status})`, {
      code: "ERR_UPDATE_CHECK",
    });
  }
  const body = (await res.json()) as Release | Release[];
  const release = Array.isArray(body) ? body[0] : body;
  if (!release) throw new BtkError("No release found on GitHub", { code: "ERR_UPDATE_CHECK" });
  return release;
}

async function download(release: Release, name: string, signal: AbortSignal): Promise<Uint8Array> {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) throw new BtkError(`Release ${release.tag_name} has no ${name}`, { code: "ERR_UPDATE_ASSET" });
  const res = await request(asset.browser_download_url, signal);
  if (!res.ok)
    throw new BtkError(`Downloading ${name} failed (${res.status})`, { code: "ERR_UPDATE_DOWNLOAD" });
  return res.bytes();
}

function verify(binary: Uint8Array, name: string, sums: string): void {
  const actual = new Bun.CryptoHasher("sha256").update(binary).digest("hex");
  if (expectedChecksum(sums, name) !== actual) {
    throw new BtkError(`The checksum of ${name} does not match SHA256SUMS`, {
      code: "ERR_UPDATE_CHECKSUM",
      hint: "Nothing was changed. Try again later.",
    });
  }
}

async function swapBinary(path: string, binary: Uint8Array, platform: NodeJS.Platform): Promise<void> {
  const temp = `${path}.new`;
  let movedOld = false;
  try {
    await Bun.write(temp, binary);
    chmodSync(temp, 0o755);
    if (platform === "win32") {
      // shortcut: Windows can rename a running exe but not delete it, so btk.exe.old stays until the next update.
      rmSync(`${path}.old`, { force: true });
      renameSync(path, `${path}.old`);
      movedOld = true;
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    if (movedOld) restoreOld(path);
    const { code, reason } = describeFileError(error);
    throw new BtkError(`Could not replace ${path}: ${reason}`, {
      code,
      hint: code === "EACCES" || code === "EPERM" ? "Run it again with sudo" : undefined,
      cause: error,
    });
  }
}

function restoreOld(path: string): void {
  try {
    renameSync(`${path}.old`, path);
  } catch {
    // The original failure is the one worth reporting; .old stays for a manual restore.
  }
}

async function updateBinary(release: Release, path: string, ctx: BtkContext): Promise<void> {
  const name = assetName(ctx.platform, ctx.arch);
  const binary = await download(release, name, ctx.signal);
  const sums = new TextDecoder().decode(await download(release, "SHA256SUMS", ctx.signal));
  verify(binary, name, sums);
  await swapBinary(path, binary, ctx.platform);
}

async function brewUpgrade(formula: string, signal: AbortSignal): Promise<void> {
  // brew's progress goes to stderr so stdout stays clean for --json.
  const proc = Bun.spawn(["brew", "upgrade", formula], {
    stdin: "inherit",
    stdout: 2,
    stderr: "inherit",
    signal,
  });
  if ((await proc.exited) !== 0) {
    throw new BtkError(`brew upgrade ${formula} failed`, {
      code: "ERR_UPDATE_BREW",
      hint: `Run "brew upgrade ${formula}" yourself to see why`,
    });
  }
}

async function updateHomebrew(
  formula: string,
  path: string,
  latest: string,
  ctx: BtkContext,
): Promise<string> {
  await brewUpgrade(formula, ctx.signal);
  const check = Bun.spawnSync([optPath(path), "--version"]);
  if (!check.success) {
    throw new BtkError("The btk that Homebrew installed does not start", {
      code: "ERR_UPDATE_BREW",
      hint: `Run "brew reinstall ${formula}"`,
    });
  }
  const installed = check.stdout.toString().trim();
  if (installed === ctx.version) {
    throw new BtkError(`Homebrew doesn't have btk ${latest} yet`, {
      code: "ERR_UPDATE_BREW_STALE",
      hint: "The formula is updated shortly after each release. Try again later.",
    });
  }
  return installed;
}

export const update = defineCommand({
  name: "update",
  aliases: ["upgrade"],
  description: "Update btk to the latest release",
  examples: ["btk update"],
  requiresConfig: false,
  projectConfig: false,
  async run(_input, ctx): Promise<UpdateResult> {
    const method = detectInstall(realpathSync(process.execPath), Bun.main);
    if (method.kind === "source") {
      throw new BtkError("btk is running from source", {
        code: "ERR_UPDATE_SOURCE",
        hint: "Run git pull && bun install in your checkout",
      });
    }

    const spinner = ctx.reporter.spinner;
    try {
      spinner.start("Checking for updates");
      const release = await fetchLatest(ctx.version.includes("-"), ctx.signal);
      const latest = release.tag_name.replace(/^v/, "");
      const result = { method: method.kind, from: ctx.version, to: latest, updated: false };
      if (Bun.semver.order(latest, ctx.version) !== 1) return result;

      if (method.kind === "homebrew") {
        spinner.stop();
        const installed = await updateHomebrew(method.formula, method.path, latest, ctx);
        return { ...result, to: installed, updated: true };
      }
      spinner.update(`Downloading btk ${latest}`);
      await updateBinary(release, method.path, ctx);
      return { ...result, updated: true };
    } finally {
      spinner.stop();
    }
  },
  render(result, out) {
    const s = out.style;
    const check = s.success(icons.success);
    out.text(
      result.updated
        ? `${check} Updated btk ${result.from} ${icons.arrow} ${s.bold(result.to)}`
        : `${check} btk ${s.bold(result.from)} is the latest version`,
    );
  },
});
