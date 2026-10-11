import { describe, expect, test } from "bun:test";
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatValue,
  pluralize,
  reduction,
} from "./format.ts";

describe("format helpers", () => {
  test("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(15 * 1024)).toBe("15.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(formatBytes(-2048)).toBe("-2.00 KB");
  });

  test("formatDuration", () => {
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(1520)).toBe("1.52s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });

  test("reduction", () => {
    expect(reduction(100, 25)).toBe(75);
    expect(reduction(100, 120)).toBe(-20);
    expect(reduction(0, 10)).toBe(0);
  });

  test("formatDimensions and pluralize", () => {
    expect(formatDimensions(1920, 1080)).toBe("1920 × 1080");
    expect(pluralize(1, "file")).toBe("1 file");
    expect(pluralize(3, "file")).toBe("3 files");
  });

  test("formatValue", () => {
    expect(formatValue(undefined)).toBe("—");
    expect(formatValue(["a", 1])).toBe("a, 1");
    expect(formatValue([])).toBe("[]");
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatValue(true)).toBe("true");
  });
});
