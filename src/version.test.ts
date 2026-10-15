import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { BUN_VERSION } from "./version.ts";

const root = join(import.meta.dir, "..");

describe("BUN_VERSION", () => {
  test("is an exact version", () => {
    expect(BUN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test.each(["README.md", "docs/getting-started.md"])(
    "%s names it and no other Bun version",
    async (file) => {
      const text = await Bun.file(join(root, file)).text();
      const named = [...text.matchAll(/Bun(?:\]\([^)]*\))? (\d+\.\d+(?:\.\d+)?)/g)].map((match) => match[1]);
      expect([...new Set(named)]).toEqual([BUN_VERSION]);
    },
  );
});
