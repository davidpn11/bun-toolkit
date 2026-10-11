import { describe, expect, test } from "bun:test";
import { levenshtein, suggest } from "./suggest.ts";

describe("suggest()", () => {
  test("edit distance counts transpositions as one edit", () => {
    expect(levenshtein("info", "info")).toBe(0);
    expect(levenshtein("ifno", "info")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  test("finds typos and prefixes", () => {
    const commands = ["info", "init", "config", "ui"];
    expect(suggest("ifno", commands)).toBe("info");
    expect(suggest("confg", commands)).toBe("config");
    expect(suggest("conf", commands)).toBe("config");
    expect(suggest("INFO", commands)).toBe("info");
  });

  test("returns nothing when no candidate is close", () => {
    expect(suggest("deploy", ["info", "init", "config", "ui"])).toBeUndefined();
    expect(suggest("x", [])).toBeUndefined();
  });
});
