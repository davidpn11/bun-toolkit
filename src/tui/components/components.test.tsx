import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { z } from "zod";
import { createTestContext } from "../../../tests/support/context.ts";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { keys, renderTui, tick } from "../../../tests/support/tui.tsx";
import { flag, positional } from "../../cli/define.ts";
import type { BtkContext } from "../../context.ts";
import { fieldsFromArgs, initialValues, labelFor } from "../form-fields.ts";
import { MASCOT_PALETTE, MASCOT_SPRITE } from "../mascot.ts";
import { FileBrowser } from "./FileBrowser.tsx";
import { halfBlockLines, MASCOT_HEIGHT, MASCOT_WIDTH, Mascot } from "./Mascot.tsx";
import { OptionsForm } from "./OptionsForm.tsx";
import { ProgressList } from "./ProgressList.tsx";
import { ResultTable } from "./ResultTable.tsx";
import { SelectList } from "./SelectList.tsx";

let ctx: BtkContext;
beforeAll(async () => {
  ctx = await createTestContext();
});

describe("<SelectList>", () => {
  const items = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta", disabled: true, tag: "soon" },
    { value: "c", label: "Gamma", description: "third" },
  ];

  test("moves with arrows, skips disabled rows, selects with enter", async () => {
    const onSelect = mock();
    const ui = renderTui(ctx, <SelectList items={items} onSelect={onSelect} />);
    expect(ui.frame()).toContain("❯ Alpha");
    await ui.press(keys.down);
    expect(ui.frame()).toContain("❯ Gamma");
    await ui.press(keys.up);
    expect(ui.frame()).toContain("❯ Alpha");
    await ui.press(keys.down, keys.enter);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0].value).toBe("c");
    ui.unmount();
  });

  test("scrolls long lists and shows how many rows are hidden", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ value: i, label: `Item ${i}` }));
    const ui = renderTui(ctx, <SelectList items={many} onSelect={() => {}} limit={5} />);
    expect(ui.frame()).toContain("↓ 15 more");
    await ui.press(...Array(6).fill(keys.down));
    expect(ui.frame()).toContain("❯ Item 6");
    expect(ui.frame()).toContain("↑ 2 more");
    ui.unmount();
  });

  test("empty state", () => {
    const ui = renderTui(ctx, <SelectList items={[]} onSelect={() => {}} emptyText="Nothing to pick" />);
    expect(ui.frame()).toContain("Nothing to pick");
    ui.unmount();
  });
});

describe("<FileBrowser>", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("photos/a.png", "x".repeat(2048));
    project.write("photos/b.JPG", "y");
    project.write("photos/notes.txt", "z");
    project.write("photos/.hidden.png", "h");
    project.write("photos/sub/c.png", "c");
    return join(project.dir, "photos");
  };

  test("lists directories first and filters by extension", async () => {
    const root = setup();
    const ui = renderTui(ctx, <FileBrowser root={root} extensions={[".png", ".jpg"]} onSubmit={() => {}} />);
    const frame = ui.frame();
    expect(frame).toContain("sub/");
    expect(frame).toContain("a.png");
    expect(frame).toContain("2.00 KB");
    expect(frame).toContain("b.JPG");
    expect(frame).not.toContain("notes.txt");
    expect(frame).not.toContain(".hidden.png");
    expect(frame.indexOf("sub/")).toBeLessThan(frame.indexOf("a.png"));
    await ui.press(".");
    expect(ui.frame()).toContain(".hidden.png");
    ui.unmount();
  });

  test("enters directories and comes back with the directory highlighted", async () => {
    const root = setup();
    const ui = renderTui(ctx, <FileBrowser root={root} extensions={[".png"]} onSubmit={() => {}} />);
    await ui.press(keys.down, keys.enter); // ".." is first, then "sub/"
    expect(ui.frame()).toContain("c.png");
    await ui.press(keys.left);
    expect(ui.frame()).toContain("❯   sub/");
    ui.unmount();
  });

  test("single pick submits the highlighted file", async () => {
    const root = setup();
    const onSubmit = mock();
    const ui = renderTui(ctx, <FileBrowser root={root} extensions={[".png"]} onSubmit={onSubmit} />);
    await ui.press(keys.down, keys.down, keys.enter);
    expect(onSubmit).toHaveBeenCalledWith([join(root, "a.png")]);
    ui.unmount();
  });

  test("multi-select with space, then enter submits the selection", async () => {
    const root = setup();
    const onSubmit = mock();
    const ui = renderTui(
      ctx,
      <FileBrowser root={root} extensions={[".png", ".jpg"]} multiple onSubmit={onSubmit} />,
    );
    await ui.press(keys.down, keys.down, keys.space, keys.space);
    expect(ui.frame()).toContain("2 selected");
    await ui.press(keys.enter);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual([join(root, "a.png"), join(root, "b.JPG")]);
    ui.unmount();
  });

  test("reports the highlighted file for previews", async () => {
    const root = setup();
    const onHighlight = mock();
    const ui = renderTui(
      ctx,
      <FileBrowser root={root} extensions={[".png"]} onSubmit={() => {}} onHighlight={onHighlight} />,
    );
    await ui.press(keys.down, keys.down);
    expect(onHighlight.mock.calls.at(-1)?.[0]?.name).toBe("a.png");
    ui.unmount();
  });
});

describe("form fields from arg specs", () => {
  const args = {
    files: positional(z.array(z.string()), { description: "Files" }),
    quality: flag(z.number().int().min(1).max(100).default(80), {
      config: "quality",
      description: "Quality",
    }),
    format: flag(z.enum(["webp", "png", "avif"]).default("webp"), { description: "Format" }),
    lossless: flag(z.boolean().default(false), { description: "Lossless" }),
    maxWidth: flag(z.number().int().positive().optional(), { description: "Max width" }),
    outDir: flag(z.string().optional(), { description: "Output directory" }),
  };

  test("fieldsFromArgs skips positionals and maps kinds", () => {
    const fields = fieldsFromArgs(args);
    expect(fields.map((f) => [f.key, f.kind])).toEqual([
      ["quality", "number"],
      ["format", "enum"],
      ["lossless", "boolean"],
      ["maxWidth", "number"],
      ["outDir", "text"],
    ]);
    expect(labelFor("maxWidth")).toBe("Max width");
  });

  test("initial values come from config first, then schema defaults", () => {
    expect(initialValues(args, { quality: 60 })).toEqual({ quality: 60, format: "webp", lossless: false });
  });

  test("<OptionsForm> steps numbers, cycles enums, toggles booleans and submits parsed values", async () => {
    const onSubmit = mock();
    const ui = renderTui(
      ctx,
      <OptionsForm fields={fieldsFromArgs(args)} initial={initialValues(args)} onSubmit={onSubmit} />,
    );
    expect(ui.frame()).toContain("Quality");
    await ui.press(keys.right, keys.right); // quality 82
    await ui.press(keys.down, keys.right); // format png
    await ui.press(keys.down, keys.space); // lossless on
    expect(ui.frame()).toContain("● on");
    await ui.press(keys.down, keys.enter, "1", "2", "0", "0", keys.enter); // maxWidth 1200
    await ui.press(keys.down, keys.down, keys.enter); // skip outDir, submit
    expect(onSubmit).toHaveBeenCalledWith({
      quality: 82,
      format: "png",
      lossless: true,
      maxWidth: 1200,
      outDir: undefined,
    });
    ui.unmount();
  });

  test("<OptionsForm> clamps numbers to the schema bounds", async () => {
    const onSubmit = mock();
    const fields = fieldsFromArgs({
      level: flag(z.number().int().min(1).max(3).default(3), { description: "L" }),
    });
    const ui = renderTui(ctx, <OptionsForm fields={fields} initial={{ level: 3 }} onSubmit={onSubmit} />);
    await ui.press(keys.right, keys.right, keys.down, keys.enter);
    expect(onSubmit).toHaveBeenCalledWith({ level: 3 });
    ui.unmount();
  });

  test("<OptionsForm> shows validation errors instead of submitting", async () => {
    const onSubmit = mock();
    const ui = renderTui(
      ctx,
      <OptionsForm fields={fieldsFromArgs(args)} initial={initialValues(args)} onSubmit={onSubmit} />,
    );
    await ui.press(keys.down, keys.down, keys.down, keys.enter, "-", "5", keys.enter);
    await ui.press(keys.down, keys.down, keys.enter);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(ui.frame()).toContain("✖ Expected an integer ≥ 1");
    ui.unmount();
  });
});

describe("display components", () => {
  test("<ProgressList> shows overall progress and per-item status", async () => {
    const ui = renderTui(
      ctx,
      <ProgressList
        items={[
          { id: "1", label: "a.png", status: "done", detail: "-42%" },
          { id: "2", label: "b.png", status: "error", detail: "decode failed" },
          { id: "3", label: "c.png", status: "running" },
          { id: "4", label: "d.png", status: "pending" },
        ]}
      />,
    );
    await tick();
    const frame = ui.frame();
    expect(frame).toContain("2/4");
    expect(frame).toContain("✔ a.png");
    expect(frame).toContain("✖ b.png");
    expect(frame).toContain("decode failed");
    ui.unmount();
  });

  test("<ResultTable> aligns columns", () => {
    const ui = renderTui(
      ctx,
      <ResultTable
        columns={[{ key: "file" }, { key: "size", align: "right" }]}
        rows={[
          { file: "a.png", size: "1 KB" },
          { file: "long-name.png", size: "100 KB" },
        ]}
      />,
    );
    const lines = ui.frame().split("\n");
    expect(lines[1]).toBe("a.png            1 KB");
    expect(lines[2]).toBe("long-name.png  100 KB");
    ui.unmount();
  });
});

describe("<Mascot>", () => {
  test("every sprite row is the same width and uses palette colors", () => {
    for (const row of MASCOT_SPRITE) {
      expect(row.length).toBe(MASCOT_WIDTH);
      for (const ch of row) if (ch !== ".") expect(MASCOT_PALETTE[ch]).toBeDefined();
    }
  });

  test("packs two pixel rows into each terminal row", () => {
    const [line] = halfBlockLines([
      ["#111", "#111", null, "#111", null],
      ["#222", "#111", "#222", null, null],
    ]);
    expect(line).toEqual([
      { text: "▀", color: "#111", backgroundColor: "#222" },
      { text: "█", color: "#111" },
      { text: "▄", color: "#222" },
      { text: "▀", color: "#111" },
      { text: " " },
    ]);
  });

  test("merges neighboring cells with the same colors", () => {
    const [line] = halfBlockLines([["#111", "#111", "#111"]]);
    expect(line).toEqual([{ text: "▀▀▀", color: "#111" }]);
  });

  test("renders at its advertised size", () => {
    const ui = renderTui(ctx, <Mascot />);
    const lines = ui.frame().split("\n");
    expect(lines).toHaveLength(MASCOT_HEIGHT);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(MASCOT_WIDTH);
    expect(ui.frame()).toContain("▀");
    ui.unmount();
  });
});
