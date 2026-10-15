import { afterEach, describe, expect, test } from "bun:test";
import { openDashboard } from "../../../../tests/support/dashboard.tsx";
import { createTempProject, type TempProject } from "../../../../tests/support/tmp.ts";
import { serve } from "../tool.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

describe("serve dashboard", () => {
  test("starts the server, lists requests, and stops when the screen closes", async () => {
    project = createTempProject();
    project.write("btk.config.ts", `export default { tools: { serve: { open: false } } };`);
    project.write("index.html", "<h1>Home</h1>");
    const ui = await openDashboard(serve, project, "Running at");
    const url = ui.frame().match(/Running at (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
    expect(url).toBeDefined();
    expect(ui.frame()).toContain("None yet");

    expect(await (await fetch(`${url}`)).text()).toContain("<h1>Home</h1>");
    await ui.until("200 GET /");

    ui.unmount();
    await Bun.sleep(50);
    expect(await fetch(`${url}`).catch(() => "stopped")).toBe("stopped");
  });

  test("a port that is taken shows why the server didn't start", async () => {
    const taken = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    project = createTempProject();
    project.write(
      "btk.config.ts",
      `export default { tools: { serve: { open: false, port: ${taken.port} } } };`,
    );
    const ui = await openDashboard(serve, project, "Could not start the server");
    expect(ui.frame()).toContain("set tools.serve.port to 0");
    ui.unmount();
    taken.stop(true);
  });
});
