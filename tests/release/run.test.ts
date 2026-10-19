import { describe, expect, test } from "bun:test";
import {
  type ChannelStatus,
  channelStatus,
  describeStatus,
  type Engine,
  parseTryArgs,
  pickEngine,
  terminalEnv,
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
    { tag_name: "v0.2.0-beta.2", prerelease: true, draft: false },
    { tag_name: "v0.1.0", prerelease: false, draft: false },
  ];
  const changesets = [
    { name: "README.md", type: "file" },
    { name: "config.json", type: "file" },
    { name: "a.md", type: "file" },
    { name: "b.md", type: "file" },
  ];
  const fake =
    (files: Record<string, unknown>) =>
    async (url: string): Promise<unknown> => {
      const key = Object.keys(files).find((part) => url.includes(part));
      return key ? files[key] : undefined;
    };

  test("beta only needs the newest published pre-release; betas have no branch", async () => {
    const urls: string[] = [];
    const status = await channelStatus("beta", (url) => {
      urls.push(url);
      return fake({ "/releases": releases })(url);
    });
    expect(status).toEqual({ published: "0.2.0-beta.2", pending: 0 });
    expect(urls).toHaveLength(1);
  });

  test("stable skips pre-releases and reads master's version and waiting changesets", async () => {
    const fetchJson = fake({
      "/releases": releases,
      "/master/package.json": { version: "0.1.0" },
      ".changeset?ref=master": changesets,
    });
    expect(await channelStatus("stable", fetchJson)).toEqual({
      published: "0.1.0",
      masterVersion: "0.1.0",
      pending: 2,
    });
  });

  test("master without a .changeset folder has none waiting", async () => {
    const fetchJson = fake({ "/releases": releases, "/master/package.json": { version: "0.1.0" } });
    expect((await channelStatus("stable", fetchJson)).pending).toBe(0);
  });
});

describe("describeStatus()", () => {
  test("up to date: only the latest release", () => {
    expect(describeStatus("beta", { published: "0.2.0-beta.2", pending: 0 })).toEqual({
      info: ["Latest beta release: v0.2.0-beta.2"],
      warnings: [],
    });
    expect(describeStatus("beta", { published: undefined, pending: 0 }).info).toEqual([
      "No beta release yet",
    ]);
  });

  test("changesets merged without a version point at a PR", () => {
    const { warnings } = describeStatus("stable", { published: "0.1.0", masterVersion: "0.1.0", pending: 3 });
    expect(warnings).toEqual([
      "3 changesets were merged into master without a version, so no release includes them. Run bun run release:version on a branch and open a PR.",
    ]);
  });

  test("a version on master that isn't published yet points at the workflow", () => {
    const { warnings } = describeStatus("stable", { published: "0.1.0", masterVersion: "0.2.0", pending: 0 });
    expect(warnings[0]).toStartWith("master is at v0.2.0, which isn't released yet");
  });
});

describe("terminalEnv()", () => {
  test("the container gets a 256-color TERM it knows, plus truecolor when the host has it", () => {
    expect(terminalEnv({ TERM: "xterm-ghostty", COLORTERM: "truecolor" })).toEqual([
      "-e",
      "TERM=xterm-256color",
      "-e",
      "COLORTERM=truecolor",
    ]);
    expect(terminalEnv({})).toEqual(["-e", "TERM=xterm-256color"]);
  });
});
