import { describe, expect, test } from "bun:test";
import { formulaAssets, PLATFORMS, parseSums, type ReleaseAsset, renderFormula } from "./homebrew-formula.ts";

const SHA = (n: number) => String(n).repeat(64);
const SUMS = PLATFORMS.map((p, i) => `${SHA(i + 1)}  btk-${p}`).join("\n");
const RELEASE: ReleaseAsset[] = [...PLATFORMS, "windows-x64.exe"].map((p, i) => ({
  name: `btk-${p}`,
  url: `https://github.com/o/r/releases/download/v1.2.3/btk-${p}`,
  apiUrl: `https://api.github.com/repos/o/r/releases/assets/${100 + i}`,
}));

describe("homebrew formula", () => {
  test("parseSums reads sha256sum lines, including binary mode", () => {
    const sums = parseSums(`${SHA(1)}  btk-linux-x64\n${SHA(2)} *btk-windows-x64.exe\n\n`);
    expect(sums.get("btk-linux-x64")).toBe(SHA(1));
    expect(sums.get("btk-windows-x64.exe")).toBe(SHA(2));
  });

  test("a private release downloads through the API with the token header", () => {
    const assets = formulaAssets(RELEASE, parseSums(SUMS), true);
    const ruby = renderFormula({ version: "1.2.3", repo: "o/r", assets, privateDownload: true });
    expect(ruby).toContain('version "1.2.3"');
    expect(ruby).toContain(
      'url "https://api.github.com/repos/o/r/releases/assets/100", headers: GITHUB_HEADERS.dup',
    );
    expect(ruby).toContain(`sha256 "${SHA(1)}"`);
    expect(ruby).toContain("HOMEBREW_GITHUB_API_TOKEN");
    expect(ruby).not.toContain("windows");
  });

  test("a public release uses plain download URLs", () => {
    const assets = formulaAssets(RELEASE, parseSums(SUMS), false);
    const ruby = renderFormula({ version: "1.2.3", repo: "o/r", assets, privateDownload: false });
    expect(ruby).toContain('url "https://github.com/o/r/releases/download/v1.2.3/btk-darwin-arm64"\n');
    expect(ruby).not.toContain("GITHUB_HEADERS");
  });

  test("a missing binary or checksum fails instead of writing a broken formula", () => {
    expect(() => formulaAssets(RELEASE.slice(1), parseSums(SUMS), false)).toThrow("btk-darwin-arm64");
    expect(() => formulaAssets(RELEASE, new Map(), false)).toThrow("checksum");
  });
});
