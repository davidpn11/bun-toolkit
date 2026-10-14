import { describe, expect, test } from "bun:test";
import {
  type ChannelStatus,
  channelStatus,
  describeStatus,
  type Engine,
  parseTryArgs,
  pickEngine,
} from "./run.ts";

describe("parseTryArgs()", () => {
  test("defaults to the stable channel with an interactive shell", () => {
    expect(parseTryArgs([])).toEqual({ channel: "stable", command: [] });
    expect(parseTryArgs(["beta"])).toEqual({ channel: "beta", command: [] });
  });

  test("everything after -- is the command to run instead of the shell", () => {
    expect(parseTryArgs(["beta", "--", "btk", "hash", "--help"])).toEqual({
      channel: "beta",
      command: ["btk", "hash", "--help"],
    });
  });

  test("anything else is a usage error", () => {
    expect(() => parseTryArgs(["nightly"])).toThrow('Unknown argument "nightly"');
    expect(() => parseTryArgs(["--intel"])).toThrow("Usage: bun run release:try");
    expect(() => parseTryArgs(["btk", "info"])).toThrow("name the channel first");
  });
});

describe("pickEngine()", () => {
  const has =
    (...names: Engine[]) =>
    (name: Engine) =>
      names.includes(name);

  test("prefers Podman, falls back to Docker", () => {
    expect(pickEngine(undefined, has("podman", "docker"))).toBe("podman");
    expect(pickEngine(undefined, has("docker"))).toBe("docker");
  });

  test("BTK_CONTAINER_ENGINE overrides the choice and is validated", () => {
    expect(pickEngine("docker", has("podman", "docker"))).toBe("docker");
    expect(() => pickEngine("nerdctl", has("podman"))).toThrow("must be podman or docker");
  });

  test("with neither installed, says what to install", () => {
    expect(() => pickEngine(undefined, has())).toThrow("brew install podman");
  });
});

describe("channelStatus()", () => {
  const releases = [
    { tag_name: "v0.3.0-beta.0", prerelease: true, draft: true },
    { tag_name: "v0.2.0-beta.1", prerelease: true, draft: false },
    { tag_name: "v0.1.0", prerelease: false, draft: false },
  ];
  const changesets = [
    { name: "README.md", type: "file" },
    { name: "config.json", type: "file" },
    { name: "pre", type: "dir" },
    { name: "a.md", type: "file" },
    { name: "b.md", type: "file" },
  ];
  const fake =
    (files: Record<string, unknown>) =>
    async (url: string): Promise<unknown> => {
      const key = Object.keys(files).find((part) => url.includes(part));
      return key ? files[key] : undefined;
    };

  test("beta reads the newest published pre-release, the beta branch, and its waiting changesets", async () => {
    const urls: string[] = [];
    const fetchJson = fake({
      "/releases": releases,
      "/beta/package.json": { version: "0.2.0-beta.1" },
      ".changeset?ref=beta": changesets,
    });
    const status = await channelStatus("beta", (url) => {
      urls.push(url);
      return fetchJson(url);
    });
    expect(status).toEqual({ published: "0.2.0-beta.1", branchVersion: "0.2.0-beta.1", pending: 2 });
    expect(
      urls.some((url) => url.includes("raw.githubusercontent.com/davidpn11/bun-toolkit/beta/package.json")),
    ).toBe(true);
  });

  test("stable skips pre-releases, and a branch without a .changeset folder has none waiting", async () => {
    const fetchJson = fake({ "/releases": releases, "/master/package.json": { version: "0.1.0" } });
    expect(await channelStatus("stable", fetchJson)).toEqual({
      published: "0.1.0",
      branchVersion: "0.1.0",
      pending: 0,
    });
  });
});

describe("describeStatus()", () => {
  const status = (overrides: Partial<ChannelStatus>): ChannelStatus => ({
    published: "0.2.0-beta.1",
    branchVersion: "0.2.0-beta.1",
    pending: 0,
    ...overrides,
  });

  test("up to date: only the latest release", () => {
    expect(describeStatus("beta", status({}))).toEqual({
      info: ["Latest beta release: v0.2.0-beta.1"],
      warnings: [],
    });
  });

  test("waiting changesets say how to publish them", () => {
    const { warnings } = describeStatus("beta", status({ pending: 4 }));
    expect(warnings).toEqual([
      "4 changesets are waiting on beta and not in any release. Run bun run release:version on beta, then commit and push to publish them.",
    ]);
    expect(describeStatus("beta", status({ pending: 1 })).warnings[0]).toStartWith("1 changeset is waiting");
  });

  test("a version bump that isn't published yet points at the workflow", () => {
    const { warnings } = describeStatus("stable", status({ published: "0.1.0", branchVersion: "0.2.0" }));
    expect(warnings[0]).toStartWith("master is at v0.2.0, which isn't released yet");
    expect(describeStatus("beta", status({ published: undefined })).info).toEqual(["No beta release yet"]);
  });
});
