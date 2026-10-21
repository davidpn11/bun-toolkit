import { describe, expect, test } from "bun:test";
import {
  channelFor,
  formulaAssets,
  formulaName,
  PLATFORMS,
  parseSums,
  type ReleaseAsset,
  renderFormula,
} from "./homebrew-formula.ts";

const SHA = (n: number) => String(n).repeat(64);
const SUMS = PLATFORMS.map((p, i) => `${SHA(i + 1)}  btk-${p}`).join("\n");
const release = (tag: string): ReleaseAsset[] =>
  [...PLATFORMS, "windows-x64.exe"].map((p) => ({
    name: `btk-${p}`,
    url: `https://github.com/o/r/releases/download/${tag}/btk-${p}`,
  }));

describe("homebrew formula", () => {
  test("parseSums reads sha256sum lines, including binary mode", () => {
    const sums = parseSums(`${SHA(1)}  btk-linux-x64\n${SHA(2)} *btk-windows-x64.exe\n\n`);
    expect(sums.get("btk-linux-x64")).toBe(SHA(1));
    expect(sums.get("btk-windows-x64.exe")).toBe(SHA(2));
  });

  test("pre-release versions go to the beta formula", () => {
    expect(channelFor("0.2.0")).toBe("stable");
    expect(channelFor("0.2.0-beta.1")).toBe("beta");
    expect(channelFor("1.0.0-rc.0")).toBe("beta");
    expect(formulaName("0.2.0")).toBe("bun-toolkit");
    expect(formulaName("0.2.0-alpha.3")).toBe("bun-toolkit-beta");
  });

  test("a stable release downloads plain release URLs and conflicts with the beta", () => {
    const assets = formulaAssets(release("v1.2.3"), parseSums(SUMS));
    const ruby = renderFormula({ version: "1.2.3", repo: "o/r", assets });
    expect(ruby).toContain("class BunToolkit < Formula");
    expect(ruby).toContain('version "1.2.3"');
    expect(ruby).toContain('url "https://github.com/o/r/releases/download/v1.2.3/btk-darwin-arm64"\n');
    expect(ruby).toContain(`sha256 "${SHA(1)}"`);
    expect(ruby).toContain('conflicts_with "bun-toolkit-beta", because: "both install btk"');
    expect(ruby).toContain('generate_completions_from_executable(bin/"btk", "completion", base_name: "btk")');
    expect(ruby).not.toContain("windows");
    expect(ruby).not.toContain("api.github.com");
  });

  test("a beta release is the BunToolkitBeta class and conflicts with stable", () => {
    const assets = formulaAssets(release("v1.3.0-beta.0"), parseSums(SUMS));
    const ruby = renderFormula({ version: "1.3.0-beta.0", repo: "o/r", assets });
    expect(ruby).toContain("class BunToolkitBeta < Formula");
    expect(ruby).toContain('conflicts_with "bun-toolkit", because: "both install btk"');
  });

  test("a missing binary or checksum fails instead of writing a broken formula", () => {
    expect(() => formulaAssets(release("v1").slice(1), parseSums(SUMS))).toThrow("btk-darwin-arm64");
    expect(() => formulaAssets(release("v1"), new Map())).toThrow("checksum");
  });
});
