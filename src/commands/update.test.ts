import { describe, expect, test } from "bun:test";
import { assetName, detectInstall, expectedChecksum, optPath } from "./update.ts";

const MAC_CELLAR = "/opt/homebrew/Cellar/bun-toolkit/0.3.0/bin/btk";
const LINUX_CELLAR = "/home/linuxbrew/.linuxbrew/Cellar/bun-toolkit-beta/0.4.0-beta.1/bin/btk";

describe("detectInstall", () => {
  test("Homebrew formulas from the Cellar path", () => {
    expect(detectInstall(MAC_CELLAR, "/$bunfs/root/btk")).toEqual({
      kind: "homebrew",
      formula: "bun-toolkit",
      path: MAC_CELLAR,
    });
    expect(detectInstall(LINUX_CELLAR, "")).toEqual({
      kind: "homebrew",
      formula: "bun-toolkit-beta",
      path: LINUX_CELLAR,
    });
  });

  test("a compiled binary elsewhere", () => {
    expect(detectInstall("/usr/local/bin/btk", "/$bunfs/root/btk")).toEqual({
      kind: "binary",
      path: "/usr/local/bin/btk",
    });
    expect(detectInstall("C:\\tools\\btk.exe", "B:\\~BUN\\root\\btk.exe").kind).toBe("binary");
  });

  test("running from source under bun", () => {
    expect(detectInstall("/Users/me/.bun/bin/bun", "/Users/me/bun-toolkit/bin/btk.ts")).toEqual({
      kind: "source",
    });
  });
});

test("optPath points at the linked version through Homebrew's opt/ link", () => {
  expect(optPath(MAC_CELLAR)).toBe("/opt/homebrew/opt/bun-toolkit/bin/btk");
  expect(optPath(LINUX_CELLAR)).toBe("/home/linuxbrew/.linuxbrew/opt/bun-toolkit-beta/bin/btk");
});

test("assetName matches the release asset names", () => {
  expect(assetName("darwin", "arm64")).toBe("btk-darwin-arm64");
  expect(assetName("linux", "x64")).toBe("btk-linux-x64");
  expect(assetName("win32", "x64")).toBe("btk-windows-x64.exe");
});

test("expectedChecksum reads sha256sum lines, text or binary mode", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  const sums = `${a}  btk-darwin-arm64\n${b} *btk-windows-x64.exe\n`;
  expect(expectedChecksum(sums, "btk-darwin-arm64")).toBe(a);
  expect(expectedChecksum(sums, "btk-windows-x64.exe")).toBe(b);
  expect(expectedChecksum(sums, "btk-linux-x64")).toBeUndefined();
});
