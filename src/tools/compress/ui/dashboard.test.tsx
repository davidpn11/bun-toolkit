import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys } from "../../../../tests/support/tui.tsx";
import { fieldsFromArgs } from "../../../tui/index.ts";
import { compress, compressRun, decompress } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

describe("compress dashboard", () => {
  test("pick files, keep the default options, see the results", async () => {
    project = createTempProject();
    project.write("app.js", "console.log('hi');\n".repeat(200));
    const ui = await openDashboard(compress, project, "Compress files");
    await ui.press(keys.enter);
    await ui.until("app.js");
    await ui.press(keys.down, keys.space, keys.enter);
    await ui.until("1 file selected");
    const submit = fieldsFromArgs(compressRun.args ?? {}, {
      exclude: ["gzip", "zstd", "brotli", "deflate", "output", "each", "recursive"],
    }).length;
    await ui.press(...Array(submit).fill(keys.down), keys.enter);
    await ui.until("1 done");
    expect(ui.frame()).toContain("app.js.gz");
    expect(existsSync(join(project.dir, "app.js.gz"))).toBe(true);
    ui.unmount();
  });

  test("a level the format can't use shows the error instead of spinning", async () => {
    project = createTempProject();
    project.write("btk.config.ts", "export default { tools: { compress: { level: 0 } } };");
    project.write("app.js", "console.log('hi');\n".repeat(200));
    const ui = await openDashboard(compress, project, "Compress files");
    await ui.press(keys.enter);
    await ui.until("app.js");
    await ui.press(keys.down, keys.space, keys.enter);
    await ui.until("1 file selected");
    const submit = fieldsFromArgs(compressRun.args ?? {}, {
      exclude: ["gzip", "zstd", "brotli", "deflate", "output", "each", "recursive"],
    }).length;
    await ui.press(...Array(submit).fill(keys.down), keys.enter);
    await ui.until("gzip levels go from 1 to 12");
    ui.unmount();
  });

  test("btk decompress --ui lists only compressed files and restores them", async () => {
    project = createTempProject();
    await Bun.write(
      join(project.dir, "notes.txt.gz"),
      Bun.gzipSync(new TextEncoder().encode("hello\n".repeat(50))),
    );
    project.write("other.txt", "plain");
    const ui = await openDashboard(decompress, project, "notes.txt.gz");
    expect(ui.frame()).not.toContain("other.txt");
    await ui.press(keys.down, keys.enter);
    await ui.until("1 done");
    expect(existsSync(join(project.dir, "notes.txt"))).toBe(true);
    ui.unmount();
  });
});
