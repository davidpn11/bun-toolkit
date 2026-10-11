import { afterEach, describe, expect, test } from "bun:test";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys } from "../../../../tests/support/tui.tsx";
import { hash } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

describe("hash dashboard", () => {
  test("pick files, pick an algorithm, see every digest", async () => {
    project = createTempProject();
    project.write("a.txt", "hello");
    project.write("b.txt", "world");
    const ui = await openDashboard(hash, project, "a.txt");
    await ui.press(keys.down, keys.space, keys.space, keys.enter);
    await ui.until("2 files selected");
    expect(ui.frame()).toContain("Cryptographic");
    expect(ui.frame()).toMatch(/❯\s*sha256/);

    await ui.press(keys.enter);
    await ui.until("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(ui.frame()).toContain("2 files");
    ui.unmount();
  });

  test("the algorithm list starts on the configured default", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `export default { tools: { hash: { algorithm: "md5" } } };`);
    project.write("a.txt", "hello");
    const ui = await openDashboard(hash, project, "a.txt");
    await ui.press(keys.down, keys.enter);
    await ui.until("pick an algorithm");
    await ui.press(keys.enter);
    await ui.until("5d41402abc4b2a76b9719d911017c592");
    ui.unmount();
  });
});
