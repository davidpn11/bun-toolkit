import { describe, expect, test } from "bun:test";
import { preModeProblem, withBunVersion } from "./version-packages.ts";

describe("withBunVersion()", () => {
  const changelog = "# bun-toolkit\n\n## 0.3.0\n\n### Minor Changes\n\n- a\n\n## 0.2.1\n\n- b\n";

  test("adds the Bun release under the new version only, once", () => {
    const once = withBunVersion(changelog, "0.3.0", "1.4.0");
    expect(once).toContain("## 0.3.0\n\nBuilt on Bun 1.4.0.\n\n### Minor Changes");
    expect(once).toContain("## 0.2.1\n\n- b");
    expect(withBunVersion(once, "0.3.0", "1.4.0")).toBe(once);
  });

  test("leaves a changelog without the version untouched", () => {
    expect(withBunVersion(changelog, "9.9.9", "1.4.0")).toBe(changelog);
  });
});

describe("preModeProblem()", () => {
  test("pre-release mode is refused with the command that leaves it", () => {
    expect(preModeProblem(true)).toContain("bun changeset pre exit");
    expect(preModeProblem(false)).toBeUndefined();
  });
});
