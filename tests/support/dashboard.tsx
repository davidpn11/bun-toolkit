import { render } from "ink-testing-library";
import type { ToolDef } from "../../src/cli/define.ts";
import { defaultRegistry } from "../../src/cli/main.ts";
import { stripAnsi } from "../../src/output/style.ts";
import { TuiApp } from "../../src/tui/app.tsx";
import { toolScreen } from "../../src/tui/screens/ToolHost.tsx";
import { createTestContext } from "./context.ts";
import type { TempProject } from "./tmp.ts";
import { tick, waitFor } from "./tui.tsx";

export async function openDashboard(tool: ToolDef, project: TempProject, firstText: string) {
  const ctx = await createTestContext({ registry: defaultRegistry(), cwd: project.dir, env: project.env });
  const instance = render(<TuiApp ctx={ctx} initial={toolScreen(tool)} onQuit={() => {}} />);
  const frame = () => stripAnsi(instance.lastFrame() ?? "");
  const press = async (...sequence: string[]) => {
    for (const key of sequence) {
      instance.stdin.write(key);
      await tick(30);
    }
  };
  await waitFor(frame, firstText);
  // Ink attaches key listeners in an effect after the first paint; let it settle before typing.
  await tick(50);
  return { frame, press, unmount: instance.unmount, until: (text: string) => waitFor(frame, text) };
}
