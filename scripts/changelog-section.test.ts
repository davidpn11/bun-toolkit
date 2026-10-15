import { describe, expect, test } from "bun:test";
import { changelogSection } from "./changelog-section.ts";

const CHANGELOG = `# bun-toolkit

## 0.2.0

### Minor Changes

- Stable feature

## 0.2.0-beta.0

### Minor Changes

- Beta feature

## 0.1.0

### Minor Changes

- First release
`;

describe("changelogSection()", () => {
  test("returns one version's body without its heading", () => {
    expect(changelogSection(CHANGELOG, "0.2.0")).toBe("### Minor Changes\n\n- Stable feature");
  });

  test("a stable version doesn't match its pre-releases, and the last section runs to the end", () => {
    expect(changelogSection(CHANGELOG, "0.2.0-beta.0")).toBe("### Minor Changes\n\n- Beta feature");
    expect(changelogSection(CHANGELOG, "0.1.0")).toBe("### Minor Changes\n\n- First release");
  });

  test("a missing or empty entry is undefined", () => {
    expect(changelogSection(CHANGELOG, "9.9.9")).toBeUndefined();
    expect(changelogSection("# x\n\n## 1.0.0\n\n## 0.9.0\n- y\n", "1.0.0")).toBeUndefined();
  });
});
