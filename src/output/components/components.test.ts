import { describe, expect, test } from "bun:test";
import { createStyler, stripAnsi } from "../style.ts";
import { renderKeyValue } from "./key-value.ts";
import { renderList } from "./list.ts";
import { renderLog } from "./log.ts";
import { renderNotice } from "./notice.ts";
import { renderProgressBar } from "./progress-bar.ts";
import { renderSummary } from "./summary.ts";
import { renderTable } from "./table.ts";

const s = createStyler(false);
const color = createStyler(true);

describe("output components", () => {
  test("log lines use icons and indent continuation lines", () => {
    expect(renderLog(s, "success", "done")).toBe("✔ done");
    expect(renderLog(s, "error", "bad\nmore")).toBe("✖ bad\n  more");
    expect(renderLog(color, "warn", "hm")).toContain("\x1b[");
  });

  test("table aligns columns, including right alignment and wide characters", () => {
    const out = renderTable(
      s,
      [
        { name: "a", size: 1 },
        { name: "long name", size: 1000 },
      ],
      { columns: [{ key: "name" }, { key: "size", align: "right" }] },
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("name       size");
    expect(lines[2]).toBe("a             1");
    expect(lines[3]).toBe("long name  1000");
  });

  test("table width ignores ANSI codes", () => {
    const out = stripAnsi(renderTable(color, [{ a: "x" }, { a: "yyy" }]));
    expect(out.split("\n")[0]).toBe("a");
    expect(out.split("\n")[1]).toBe("───");
  });

  test("key-value aligns keys", () => {
    expect(renderKeyValue(s, { a: 1, long: "x" })).toBe("a     1\nlong  x");
    expect(renderKeyValue(s, { a: 1 }, { plain: true })).toBe("a: 1");
  });

  test("list, notice and summary", () => {
    expect(renderList(s, ["one", "two"])).toBe("• one\n• two");
    expect(renderList(s, ["one"], { ordered: true })).toBe("1. one");
    expect(renderNotice(s, ["hi", "there"])).toContain("│ there │");
    expect(renderNotice(s, ["hi"], { plain: true })).toBe("! hi");
    expect(renderSummary(s, { files: 3, saved: "1 MB" })).toBe("✔ Done · 3 files · 1 MB saved");
    expect(renderSummary(s, { files: 3 }, { plain: true })).toBe("summary files=3");
    expect(renderSummary(s, { files: 3, "": "1 MB → 2 KB" })).toBe("✔ Done · 3 files · 1 MB → 2 KB");
    expect(renderSummary(s, { failed: 1 }, { title: "Done", tone: "warning" })).toBe("⚠ Done · 1 failed");
  });

  test("progress bar shows ratio, counts and eta", () => {
    const line = renderProgressBar(
      s,
      { current: 5, total: 10, label: "Files", detail: "a.png", startedAt: 0 },
      1000,
      10,
    );
    expect(line).toBe("Files █████░░░░░ 5/10 eta 1.00s a.png");
  });
});
