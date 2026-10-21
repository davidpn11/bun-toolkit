import { beforeAll, describe, expect, test } from "bun:test";
import { createTestContext } from "../../tests/support/context.ts";
import type { BtkContext } from "../context.ts";
import { complete, FILES } from "./complete.ts";

let ctx: BtkContext;
beforeAll(async () => {
  ctx = await createTestContext();
});

const values = (...words: string[]) => complete(ctx.registry, words, ctx).map((line) => line.split("\t")[0]);

describe("complete()", () => {
  test("commands and tools come first, without hidden ones", () => {
    expect(values("co")).toEqual(["config", "completion", "convert", "compress"]);
    expect(values("")).not.toContain("__complete");
    expect(complete(ctx.registry, ["hash"], ctx)[0]).toBe("hash\tHash and verify files");
  });

  test("a tool offers its actions, plus paths when its default action takes them", () => {
    expect(values("md", "")).toEqual(["preview", "serve", "build", "html", "themes", FILES]);
    expect(values("config", "")).toEqual(["show", "validate", "path"]);
  });

  test("flags come from the action, the global options and --ui", () => {
    expect(values("md", "--th")).toEqual(["--theme"]);
    expect(values("md", "serve", "--")).toContain("--port");
    expect(values("md", "serve", "--")).toContain("--json");
    expect(values("md", "--u")).toEqual(["--ui"]);
  });

  test("flag values: enums, choices such as theme names, paths, or nothing for numbers", () => {
    expect(values("convert", "x.json", "--to", "y")).toEqual(["yaml"]);
    expect(values("md", "-t", "")).toEqual(["btk", "plain"]);
    expect(values("md", "--css", "")).toEqual([FILES]);
    expect(values("serve", "--port", "")).toEqual([]);
    expect(values("md", "--theme=plain", "")).toContain(FILES);
  });

  test("positionals: enum values, then paths for later words", () => {
    expect(values("completion", "")).toEqual(["zsh", "bash", "fish"]);
    expect(values("hash", "a.txt", "")).toEqual([FILES]);
  });
});
