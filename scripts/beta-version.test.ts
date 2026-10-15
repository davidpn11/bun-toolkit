import { describe, expect, test } from "bun:test";
import { nextBeta } from "./beta-version.ts";

describe("nextBeta()", () => {
  test("one more than the highest beta of the same base version", () => {
    expect(nextBeta("0.2.0", ["v0.1.0", "v0.2.0-beta.0", "v0.2.0-beta.1"])).toBe("0.2.0-beta.2");
    expect(nextBeta("0.2.0", ["v0.2.0-beta.9", "v0.2.0-beta.10"])).toBe("0.2.0-beta.11");
  });

  test("a new base version starts at beta.0, ignoring other bases and odd tags", () => {
    expect(nextBeta("0.3.0", ["v0.2.0-beta.4", "v0.3.0-beta.x", "v0.3.0-rc.1"])).toBe("0.3.0-beta.0");
    expect(nextBeta("1.0.0", [])).toBe("1.0.0-beta.0");
  });
});
