import { describe, expect, test } from "bun:test";
import { type Engine, parseTryArgs, pickEngine } from "./run.ts";

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
