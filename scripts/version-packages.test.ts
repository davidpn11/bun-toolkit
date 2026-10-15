import { describe, expect, test } from "bun:test";
import { preModeProblem } from "./version-packages.ts";

describe("preModeProblem()", () => {
  test("pre-release mode is refused with the command that leaves it", () => {
    expect(preModeProblem(true)).toContain("bun changeset pre exit");
    expect(preModeProblem(false)).toBeUndefined();
  });
});
