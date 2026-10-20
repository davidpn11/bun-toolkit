import { describe, expect, test } from "bun:test";
import { type ReleaseState, releaseCheck } from "./release-check.ts";

const state = (overrides: Partial<ReleaseState>): ReleaseState => ({
  baseVersion: "0.1.0",
  headVersion: "0.1.0",
  pending: 0,
  changedFiles: [],
  tagged: false,
  changelog: undefined,
  branch: "feature/x",
  ...overrides,
});

describe("releaseCheck()", () => {
  test("a versioned PR says what merging releases, with the notes and how to try a beta", () => {
    const check = releaseCheck(state({ headVersion: "0.2.0", changelog: "### Minor Changes\n\n- New tool" }));
    expect(check).toMatchObject({ level: "notice", title: "Merging releases v0.2.0" });
    expect(check.summary).toContain("- New tool");
    expect(check.summary).toContain("gh workflow run beta.yml --ref 'feature/x'");
  });

  test("the beta command quotes the branch, so pasting it never runs a $(…) in the name", () => {
    const check = releaseCheck(state({ headVersion: "0.2.0", branch: "a$(id)'b" }));
    expect(check.summary).toContain(`--ref 'a$(id)'\\''b'`);
  });

  test("pending changesets warn with the command that versions them", () => {
    const check = releaseCheck(state({ pending: 2, changedFiles: ["src/a.ts"] }));
    expect(check).toMatchObject({ level: "warning", title: "Not versioned yet" });
    expect(check.summary).toContain("2 changesets are waiting");
    expect(check.summary).toContain("bun run release:version");
  });

  test("CLI changes without a changeset warn; docs-only changes don't", () => {
    expect(releaseCheck(state({ changedFiles: ["src/tools/md/tool.ts"] })).title).toBe("No changeset");
    expect(releaseCheck(state({ changedFiles: ["bin/btk.ts"] })).level).toBe("warning");
    expect(releaseCheck(state({ changedFiles: ["docs/roadmap.md", "README.md"] }))).toMatchObject({
      level: "notice",
      title: "Nothing to release",
    });
  });

  test("an already tagged, lower or beta version warns", () => {
    expect(releaseCheck(state({ headVersion: "0.2.0", tagged: true })).title).toBe(
      "v0.2.0 is already released",
    );
    expect(releaseCheck(state({ baseVersion: "0.3.0", headVersion: "0.2.0" })).title).toBe(
      "The version went backwards",
    );
    expect(releaseCheck(state({ headVersion: "0.2.0-beta.1" })).title).toBe(
      "A beta version on the way to master",
    );
  });
});
