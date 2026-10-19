import { describe, expect, mock, test } from "bun:test";
import { render } from "ink-testing-library";
import { createTestContext } from "../../tests/support/context.ts";
import { demoTool, testRegistry } from "../../tests/support/fake-tool.ts";
import { keys, tick, waitFor } from "../../tests/support/tui.tsx";
import { createRegistry } from "../cli/define.ts";
import { defaultRegistry } from "../cli/main.ts";
import { builtins } from "../commands/index.ts";
import { stripAnsi } from "../output/style.ts";
import { TuiApp } from "./app.tsx";
import { canShowMascot, homeScreen } from "./screens/Home.tsx";
import { toolScreen } from "./screens/ToolHost.tsx";

type Tools = "none" | "demo" | "shipped";

async function renderApp(options: { tools?: Tools; initial?: typeof homeScreen } = {}) {
  const tools = options.tools ?? "none";
  const registry =
    tools === "demo"
      ? testRegistry()
      : tools === "shipped"
        ? defaultRegistry()
        : createRegistry(builtins, []);
  const ctx = await createTestContext({ registry });
  const onQuit = mock();
  const instance = render(<TuiApp ctx={ctx} initial={options.initial ?? homeScreen} onQuit={onQuit} />);
  await tick();
  return {
    onQuit,
    frame: () => stripAnsi(instance.lastFrame() ?? ""),
    async press(...sequence: string[]) {
      for (const key of sequence) {
        instance.stdin.write(key);
        await tick(30);
      }
    },
    unmount: instance.unmount,
  };
}

describe("<TuiApp>", () => {
  test("home screen with no tools shows the empty state and built-in screens", async () => {
    const app = await renderApp();
    const frame = app.frame();
    expect(frame).toContain("◆ bun-toolkit");
    expect(frame).toContain("Home");
    expect(frame).toContain("No tools installed yet");
    expect(frame).toContain("❯ Info");
    expect(frame).toContain("Config");
    expect(frame).toContain("q quit");
    app.unmount();
  });

  test("enter opens a screen, breadcrumbs follow, esc goes back", async () => {
    const app = await renderApp();
    await app.press(keys.enter);
    expect(app.frame()).toContain("Home ❯ Info");
    expect(app.frame()).toContain("bun-toolkit");
    expect(app.frame()).toContain("esc back");
    await app.press(keys.escape);
    expect(app.frame()).toContain("No tools installed yet");
    app.unmount();
  });

  test("config screen shows validation status", async () => {
    const app = await renderApp();
    await app.press(keys.down, keys.enter);
    expect(app.frame()).toContain("Home ❯ Config");
    expect(app.frame()).toContain("built-in defaults apply");
    app.unmount();
  });

  test("? toggles the help overlay", async () => {
    const app = await renderApp();
    await app.press("?");
    expect(app.frame()).toContain("Toggle this help");
    await app.press("?");
    expect(app.frame()).toContain("No tools installed yet");
    app.unmount();
  });

  test("q and the Quit item quit", async () => {
    const app = await renderApp();
    await app.press("q");
    expect(app.onQuit).toHaveBeenCalledTimes(1);
    await app.press(keys.down, keys.down, keys.enter);
    expect(app.onQuit).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  test("the shipped registry lists the image tool", async () => {
    const app = await renderApp({ tools: "shipped" });
    expect(app.frame()).toMatch(/❯\s*image\s+Convert, compress and inspect images/);
    expect(app.frame()).not.toContain("No tools installed yet");
    app.unmount();
  });

  test("registered tools are listed and open their lazy dashboard", async () => {
    const app = await renderApp({ tools: "demo" });
    expect(app.frame()).toContain("❯ demo");
    expect(app.frame()).toContain("A fake tool for tests");
    await app.press(keys.enter);
    await waitFor(app.frame, "demo dashboard · level 5");
    expect(app.frame()).toContain("Home ❯ demo");
    app.unmount();
  });

  test("a tool screen can be the initial screen (btk <tool> --ui)", async () => {
    const app = await renderApp({ tools: "demo", initial: toolScreen(demoTool) });
    await waitFor(app.frame, "demo dashboard");
    expect(app.frame()).not.toContain("esc back");
    app.unmount();
  });
});

describe("canShowMascot()", () => {
  test("needs room and at least 256 colors, since 16 colors turn the sprite into blocks", () => {
    expect(canShowMascot(200, 50, 3)).toBe(true);
    expect(canShowMascot(200, 50, 2)).toBe(true);
    expect(canShowMascot(200, 50, 1)).toBe(false);
    expect(canShowMascot(60, 50, 3)).toBe(false);
    expect(canShowMascot(200, 10, 3)).toBe(false);
  });
});
