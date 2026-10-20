import { describe, expect, test } from "bun:test";
import { assetName, detectInstall, expectedChecksum } from "./update.ts";

describe("detectInstall", () => {
  test("Homebrew formulas from the Cellar path", () => {
    expect(detectInstall("/opt/homebrew/Cellar/bun-toolkit/0.3.0/bin/btk", "/$bunfs/root/btk")).toEqual({
      kind: "homebrew",
      formula: "bun-toolkit",
    });
    expect(
      detectInstall("/home/linuxbrew/.linuxbrew/Cellar/bun-toolkit-beta/0.4.0-beta.1/bin/btk", ""),
    ).toEqual({
      kind: "homebrew",
      formula: "bun-toolkit-beta",
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
