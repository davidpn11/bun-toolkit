import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { dotSlash } from "../../../../tests/support/paths.ts";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys } from "../../../../tests/support/tui.tsx";
import { convert } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

describe("convert dashboard", () => {
  test("pick a file and a format, preview it, then write it", async () => {
    project = createTempProject();
    project.write("app.yaml", "name: app\nport: 8080\n");
    project.write("notes.txt", "not data");
    const ui = await openDashboard(convert, project, "app.yaml");
    expect(ui.frame()).not.toContain("notes.txt");

    await ui.press(keys.down, keys.enter);
    await ui.until("convert to");
    await ui.press(keys.down, keys.down, keys.enter);
    await ui.until("yaml → toml");
    expect(ui.frame()).toContain('name = "app"');

    await ui.press("w");
    await ui.until(`Wrote ${dotSlash("app.toml")}`);
    expect(readFileSync(join(project.dir, "app.toml"), "utf8")).toBe('name = "app"\nport = 8080\n');

    await ui.press("w");
    await ui.until("app.toml already exists");
    ui.unmount();
  });

  test("a file that fails to parse shows the error instead of a preview", async () => {
    project = createTempProject();
    project.write("bad.json", "{nope");
    const ui = await openDashboard(convert, project, "bad.json");
    await ui.press(keys.down, keys.enter);
    await ui.until("convert to");
    await ui.press(keys.enter);
    await ui.until("Invalid JSON");
    expect(ui.frame()).not.toContain("write file");
    ui.unmount();
  });
});
