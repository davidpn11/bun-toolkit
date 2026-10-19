import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { collectFiles } from "../../shared/collect.ts";
import { ConvertError, parse, sniff, stringify, type WriteOptions, xmlDocument } from "./codec.ts";
import { type ConvertOptions, convertFiles, convertText, detectFormat } from "./convert.ts";
import { isDataPath } from "./formats.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const write: WriteOptions = { indent: 2, pretty: true, xmlRoot: "root" };
const options = (patch: Partial<ConvertOptions> = {}): ConvertOptions => ({ ...write, to: "json", ...patch });
const data = { name: "app", port: 8080, tags: ["a", "b"], nested: { on: true } };

describe("codec", () => {
  test("every writable format round-trips through its parser", () => {
    for (const format of ["json", "yaml", "toml", "json5"] as const) {
      expect(parse(stringify(data, format, write), format)).toEqual(data);
    }
    expect(parse(stringify([data, data], "jsonl", write), "jsonl")).toEqual([data, data]);
  });

  test("pretty, compact and indent", () => {
    expect(stringify({ a: [1] }, "json", write)).toBe('{\n  "a": [\n    1\n  ]\n}\n');
    expect(stringify({ a: [1] }, "json", { ...write, pretty: false })).toBe('{"a":[1]}\n');
    expect(stringify({ a: 1 }, "json", { ...write, indent: 4 })).toBe('{\n    "a": 1\n}\n');
  });

  test("YAML at a custom indent aligns nested lists and keeps empty collections inline", () => {
    const value = { a: { b: [1, [2]] }, c: [], d: {} };
    expect(stringify(value, "yaml", { ...write, indent: 4 })).toBe(
      "a:\n    b:\n        - 1\n        - - 2\nc: []\nd: {}\n",
    );
  });

  test("JSONC and JSON5 accept comments and trailing commas", () => {
    expect(parse('{"a": 1, /* note */ "b": [1,],}', "jsonc")).toEqual({ a: 1, b: [1] });
    expect(parse("{a: 1, // note\n b: 'x',}", "json5")).toEqual({ a: 1, b: "x" });
  });

  test("TOML needs a table at the top level", () => {
    expect(() => stringify([1, 2], "toml", write)).toThrow("TOML needs a table");
  });

  test("XML wraps values that are not a single root element", () => {
    expect(xmlDocument({ order: { id: 1 } }, "root")).toEqual({ order: { id: 1 } });
    expect(xmlDocument({ a: 1, b: 2 }, "root")).toEqual({ root: { a: 1, b: 2 } });
    expect(xmlDocument([1, 2], "list")).toEqual({ list: { item: [1, 2] } });
    expect(stringify([1, 2], "xml", { ...write, pretty: false })).toBe(
      "<root><item>1</item><item>2</item></root>\n",
    );
  });

  test("TOML dates become ISO strings for other formats but stay dates in TOML", () => {
    const value = parse("when = 1979-05-27T07:32:00Z\n", "toml");
    expect(stringify(value, "yaml", write)).toContain("when: 1979-05-27T07:32:00Z");
    expect(stringify(value, "toml", write)).toBe("when = 1979-05-27T07:32:00Z\n");
  });

  test("JSONL reports the line of the first bad value", () => {
    expect(() => parse('{"a":1}\n{"b":2}\n{bad}\n', "jsonl")).toThrow("Invalid JSONL on line 3");
  });

  test("parse errors name the format and suggest --from", () => {
    try {
      parse("a: [1,", "yaml");
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toBeInstanceOf(ConvertError);
      expect((error as ConvertError).message).toStartWith("Invalid YAML:");
      expect((error as ConvertError).hint).toContain("--from");
    }
  });

  test("sniffing only claims formats it can confirm", () => {
    expect(sniff("  <a/>")).toBe("xml");
    expect(sniff('{"a":1}')).toBe("json");
    expect(sniff('{"a":1}\n{"b":2}\n')).toBe("jsonl");
    expect(sniff("a: 1")).toBeUndefined();
  });
});

describe("detectFormat() and convertText()", () => {
  test("explicit --from beats the extension, which beats sniffing", () => {
    expect(detectFormat("{}", "yaml", "x.json")).toBe("yaml");
    expect(detectFormat("{}", undefined, "x.yml")).toBe("yaml");
    expect(detectFormat("{}", undefined)).toBe("json");
    expect(() => detectFormat("a: 1", undefined)).toThrow("Can't tell the format");
  });

  test("converts text end to end", () => {
    expect(convertText("a: 1\n", options({ from: "yaml" })).output).toBe('{\n  "a": 1\n}\n');
  });
});

describe("convertFiles()", () => {
  async function batch(
    to: ConvertOptions["to"],
    plan: { overwrite?: boolean; dryRun?: boolean; outDir?: string } = {},
  ) {
    const collected = await collectFiles(["."], { cwd: project.dir, recursive: true, accept: isDataPath });
    return convertFiles(collected, options({ to }), { overwrite: false, dryRun: false, ...plan });
  }

  test("writes next to each original and never replaces files without --overwrite", async () => {
    project = createTempProject();
    project.write("a.yaml", "a: 1\n");
    project.write("sub/b.toml", "b = 2\n");
    const first = await batch("json");
    expect(first.totals).toEqual({ converted: 2, skipped: 0, failed: 0 });
    expect(readFileSync(join(project.dir, "sub/b.json"), "utf8")).toBe('{\n  "b": 2\n}\n');

    const second = await batch("json");
    expect(second.files.find((f) => f.input.endsWith("a.json"))?.code).toBe("SKIP_PREVIOUS_OUTPUT");
    expect(second.files.find((f) => f.input.endsWith("a.yaml"))?.code).toBe("SKIP_EXISTS");
  });

  test("two sources for one output: the first in sort order wins", async () => {
    project = createTempProject();
    project.write("a.json", '{"from":"json"}');
    project.write("a.yaml", "from: yaml\n");
    const report = await batch("toml");
    expect(report.files.map((f) => f.code ?? f.status)).toEqual(["converted", "SKIP_DUPLICATE_OUTPUT"]);
    expect(readFileSync(join(project.dir, "a.toml"), "utf8")).toContain('from = "json"');
  });

  test("dry runs write nothing; --out-dir mirrors folders; failures don't stop the batch", async () => {
    project = createTempProject();
    project.write("a.yaml", "a: 1\n");
    project.write("sub/bad.json", "{nope");
    const dry = await batch("toml", { dryRun: true });
    expect(dry.totals.converted).toBe(1);
    expect(existsSync(join(project.dir, "a.toml"))).toBe(false);

    const out = await batch("yaml", { outDir: join(project.dir, "out") });
    expect(out.totals).toMatchObject({ converted: 1, failed: 1 });
    expect(out.files.find((f) => f.status === "failed")?.reason).toStartWith("Invalid JSON");
    expect(existsSync(join(project.dir, "out/a.yaml"))).toBe(true);
  });
});
