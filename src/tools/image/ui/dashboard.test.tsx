import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { createTestContext } from "../../../../tests/support/context.ts";
import { writeImage } from "../../../../tests/support/images.ts";
import { dotSlash } from "../../../../tests/support/paths.ts";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { keys, tick, waitFor } from "../../../../tests/support/tui.tsx";
import { defaultRegistry } from "../../../cli/main.ts";
import { stripAnsi } from "../../../output/style.ts";
import { TuiApp } from "../../../tui/app.tsx";
import { fieldsFromArgs } from "../../../tui/index.ts";
import { toolScreen } from "../../../tui/screens/ToolHost.tsx";
import { image, optimize } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

async function openDashboard() {
  project = createTempProject();
  await writeImage(join(project.dir, "a.png"), { seed: 1 });
  await writeImage(join(project.dir, "b.png"), { seed: 2 });
  const ctx = await createTestContext({ registry: defaultRegistry(), cwd: project.dir, env: project.env });
  const instance = render(<TuiApp ctx={ctx} initial={toolScreen(image)} onQuit={() => {}} />);
  const frame = () => stripAnsi(instance.lastFrame() ?? "");
  const press = async (...sequence: string[]) => {
    for (const key of sequence) {
      instance.stdin.write(key);
      await tick(30);
    }
  };
  await waitFor(frame, "a.png");
  return { frame, press, unmount: instance.unmount, dir: project.dir };
}

describe("image dashboard", () => {
  test("browse shows images with a preview of the highlighted one", async () => {
    const ui = await openDashboard();
    await ui.press(keys.down);
    await waitFor(ui.frame, "320 × 240");
    expect(ui.frame()).toContain("Preview");
    expect(ui.frame()).toContain("PNG");
    ui.unmount();
  });

  test("select, set options, run, see results, then come back to a refreshed list", async () => {
    const ui = await openDashboard();
    await ui.press(keys.down, keys.space, keys.space);
    expect(ui.frame()).toContain("2 selected");

    await ui.press(keys.enter);
    await waitFor(ui.frame, "2 images selected");
    expect(ui.frame()).toContain("Format");
    expect(ui.frame()).toContain("webp");

    const submitRow = fieldsFromArgs(optimize.args ?? {}, { exclude: ["preset", "recursive"] }).length;
    await ui.press(...Array(submitRow).fill(keys.down), keys.enter);
    await waitFor(ui.frame, "Done · 2 converted");
    expect(existsSync(join(ui.dir, "a.webp"))).toBe(true);
    expect(ui.frame()).toContain(dotSlash("b.png"));

    await ui.press(keys.enter);
    await waitFor(ui.frame, "a.webp");
    expect(ui.frame()).not.toContain("selected");
    ui.unmount();
  });

  test("esc from options returns to the browser with the selection kept", async () => {
    const ui = await openDashboard();
    await ui.press(keys.down, keys.space);
    await ui.press(keys.enter);
    await waitFor(ui.frame, "1 image selected");
    await ui.press(keys.escape);
    await waitFor(ui.frame, "1 selected");
    ui.unmount();
  });
});
