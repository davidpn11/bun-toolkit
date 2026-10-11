import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { UsageError } from "../errors.ts";
import { parseArgs } from "./args.ts";
import { flag, positional } from "./define.ts";

const spec = {
  files: positional(z.array(z.string()).min(1), { description: "Input files" }),
  quality: flag(z.number().int().min(1).max(100).default(80), { alias: "q", description: "Quality" }),
  format: flag(z.enum(["webp", "png"]).optional(), { config: "format", description: "Format" }),
  maxWidth: flag(z.number().int().positive().optional(), { description: "Max width" }),
  recursive: flag(z.boolean().default(false), { alias: "r", description: "Recurse" }),
  strip: flag(z.boolean().default(true), { alias: "s", description: "Strip metadata" }),
  exclude: flag(z.array(z.string()).default([]), { description: "Exclude" }),
};

const parse = (tokens: string[], toolConfig?: Record<string, unknown>) =>
  parseArgs(tokens, spec, { commandPath: "image optimize", toolConfig });

function usageError(fn: () => unknown): UsageError {
  try {
    fn();
  } catch (error) {
    if (error instanceof UsageError) return error;
    throw error;
  }
  throw new Error("expected a UsageError");
}

describe("parseArgs()", () => {
  test("positionals, long flags, short flags and defaults", () => {
    const { values, sources } = parse(["a.png", "b.png", "--quality", "90", "-r", "--max-width=1920"]);
    expect(values).toEqual({
      files: ["a.png", "b.png"],
      quality: 90,
      format: undefined,
      maxWidth: 1920,
      recursive: true,
      strip: true,
      exclude: [],
    });
    expect(sources.quality).toBe("flag");
    expect(sources.strip).toBe("default");
    expect(sources.files).toBe("argument");
  });

  test("short flag values: -q 70, -q70, and boolean clusters", () => {
    expect(parse(["a", "-q", "70"]).values.quality).toBe(70);
    expect(parse(["a", "-q70"]).values.quality).toBe(70);
    const { values } = parse(["a", "-rs"]);
    expect(values.recursive).toBe(true);
    expect(values.strip).toBe(true);
  });

  test("--no-<flag> negates booleans", () => {
    expect(parse(["a", "--no-strip"]).values.strip).toBe(false);
  });

  test("repeated array flags accumulate", () => {
    expect(parse(["a", "--exclude", "x", "--exclude=y"]).values.exclude).toEqual(["x", "y"]);
  });

  test("everything after -- is positional", () => {
    expect(parse(["--", "--weird-file.png"]).values.files).toEqual(["--weird-file.png"]);
  });

  test("config fills flags that were not passed; flags beat config", () => {
    expect(parse(["a"], { format: "png" })).toMatchObject({
      values: { format: "png" },
      sources: { format: "config" },
    });
    expect(parse(["a", "--format", "webp"], { format: "png" }).values.format).toBe("webp");
  });

  test("a config value that fails the flag schema names the config key", () => {
    const error = usageError(() =>
      parseArgs(["a"], spec, {
        commandPath: "image optimize",
        toolName: "image",
        toolConfig: { format: "gif" },
      }),
    );
    expect(error.message).toContain("--format (from config tools.image.format)");
  });

  test("unknown flags suggest the closest option", () => {
    const error = usageError(() => parse(["a", "--qualty", "3"]));
    expect(error.message).toBe("Unknown option --qualty");
    expect(error.hint).toBe("Did you mean --quality?");
    expect(error.exitCode).toBe(2);
  });

  test("unknown short flags", () => {
    expect(usageError(() => parse(["a", "-z"])).message).toBe("Unknown option -z");
  });

  test("a flag that needs a value", () => {
    const error = usageError(() => parse(["a", "--quality"]));
    expect(error.message).toBe("Option --quality needs a value");
    expect(error.hint).toContain("an integer from 1 to 100");
  });

  test("negative numbers are values, not flags", () => {
    const error = usageError(() => parse(["a", "--max-width", "-5"]));
    expect(error.message).toContain("--max-width");
    expect(error.message).toContain("received -5");
  });

  test("out-of-range and wrong-type values explain what was expected", () => {
    expect(usageError(() => parse(["a", "-q", "150"])).message).toBe(
      "Invalid value for --quality: expected an integer from 1 to 100, received 150",
    );
    expect(usageError(() => parse(["a", "-q", "abc"])).message).toContain('received "abc"');
    expect(usageError(() => parse(["a", "--format", "gif"])).message).toBe(
      'Invalid value for --format: expected one of webp, png, received "gif"',
    );
  });

  test("several problems are reported together", () => {
    const error = usageError(() => parse(["a", "-q", "0", "--format", "gif"]));
    expect(error.message).toBe("2 invalid arguments");
    expect(error.details).toHaveLength(2);
  });

  test("missing required positional", () => {
    const error = usageError(() => parse(["-q", "80"]));
    expect(error.message).toBe("Missing argument <files>");
    expect(error.hint).toContain("btk image optimize <files>");
  });

  test("extra positionals are rejected", () => {
    const single = { file: positional(z.string(), { description: "One file" }) };
    const error = usageError(() => parseArgs(["a", "b"], single, { commandPath: "x" }));
    expect(error.message).toBe('Unexpected argument "b"');
  });

  test("required flags", () => {
    const required = { name: flag(z.string(), { description: "Name" }) };
    expect(usageError(() => parseArgs([], required, { commandPath: "x" })).message).toBe(
      "Missing required option --name",
    );
  });
});
