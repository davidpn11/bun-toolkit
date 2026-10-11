import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { coerceText, describeExpected, inspectSchema } from "./schema-info.ts";

describe("inspectSchema()", () => {
  test("numbers with bounds and defaults", () => {
    expect(inspectSchema(z.number().int().min(1).max(100).default(80))).toMatchObject({
      kind: "number",
      min: 1,
      max: 100,
      isInt: true,
      hasDefault: true,
      defaultValue: 80,
      optional: true,
    });
  });

  test("enums, booleans, strings and arrays", () => {
    expect(inspectSchema(z.enum(["a", "b"]).optional())).toMatchObject({
      kind: "enum",
      enumValues: ["a", "b"],
      optional: true,
    });
    expect(inspectSchema(z.boolean())).toMatchObject({ kind: "boolean", optional: false });
    expect(inspectSchema(z.string())).toMatchObject({ kind: "string", optional: false });
    expect(inspectSchema(z.array(z.number()))).toMatchObject({ kind: "array", itemKind: "number" });
  });

  test("coerce and pipes are unwrapped", () => {
    expect(inspectSchema(z.coerce.number()).kind).toBe("number");
    expect(inspectSchema(z.string().transform((s) => s.length)).kind).toBe("string");
  });
});

describe("coerceText()", () => {
  test("numbers and booleans", () => {
    expect(coerceText("42", "number")).toBe(42);
    expect(coerceText("4x", "number")).toBe("4x");
    expect(coerceText("", "number")).toBe("");
    expect(coerceText("yes", "boolean")).toBe(true);
    expect(coerceText("0", "boolean")).toBe(false);
    expect(coerceText("maybe", "boolean")).toBe("maybe");
    expect(coerceText("x", "string")).toBe("x");
  });
});

describe("describeExpected()", () => {
  test("reads well in error messages", () => {
    expect(describeExpected(inspectSchema(z.number().int().min(1).max(9)))).toBe("an integer from 1 to 9");
    expect(describeExpected(inspectSchema(z.number().min(0)))).toBe("a number ≥ 0");
    expect(describeExpected(inspectSchema(z.enum(["x", "y"])))).toBe("one of x, y");
    expect(describeExpected(inspectSchema(z.number().int().positive()))).toBe("an integer ≥ 1");
    expect(describeExpected(inspectSchema(z.number().positive()))).toBe("a number > 0");
  });
});
