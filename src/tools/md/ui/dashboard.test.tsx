import { afterEach, describe, expect, test } from "bun:test";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys } from "../../../../tests/support/tui.tsx";
import { md } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

describe("md dashboard", () => {
  test("lists markdown files and renders the picked one for the terminal", async () => {
    project = createTempProject();
    project.write("README.md", "# Hello\n\nSome **bold** text.\n\n- one\n- two\n");
    project.write("notes.txt", "not markdown");
    const ui = await openDashboard(md, project, "README.md");
    expect(ui.frame()).not.toContain("notes.txt");

    await ui.press(keys.down, keys.enter);
    await ui.until("btk theme");
    expect(ui.frame()).toContain("Hello");
    expect(ui.frame()).not.toContain("# Hello");
    expect(ui.frame()).toContain("• one");
    ui.unmount();
  });

  test("a broken theme setting shows the error instead of the page", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `export default { tools: { md: { theme: "nope" } } };`);
    project.write("README.md", "# Hello\n");
    const ui = await openDashboard(md, project, "README.md");
    await ui.press(keys.down, keys.enter);
    await ui.until('Unknown theme "nope"');
    ui.unmount();
  });
});
