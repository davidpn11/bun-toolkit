import { render } from "ink-testing-library";
import type { ReactNode } from "react";
import type { BtkContext } from "../../src/context.ts";
import { stripAnsi } from "../../src/output/style.ts";
import { TuiProviders } from "../../src/tui/context.tsx";
import { NavigationProvider } from "../../src/tui/navigation.tsx";

export const keys = {
  up: "\u001B[A",
  down: "\u001B[B",
  right: "\u001B[C",
  left: "\u001B[D",
  enter: "\r",
  escape: "\u001B",
  space: " ",
  backspace: "\u007F",
  tab: "\t",
};

export const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until the frame shows `text`, then a little longer: Ink attaches key listeners in an effect
 * after the paint, so a key sent the moment the text appears can be dropped.
 */
export async function waitFor(frame: () => string, text: string, timeoutMs = 3000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!frame().includes(text)) {
    if (Date.now() > until) throw new Error(`Timed out waiting for "${text}". Last frame:\n${frame()}`);
    await tick(20);
  }
  await tick(50);
}

export function renderTui(ctx: BtkContext, node: ReactNode, onQuit: () => void = () => {}) {
  const instance = render(
    <TuiProviders ctx={ctx}>
      <NavigationProvider initial={{ id: "test", title: "Test", render: () => node }} onQuit={onQuit}>
        {node}
      </NavigationProvider>
    </TuiProviders>,
  );
  return {
    ...instance,
    frame: () => stripAnsi(instance.lastFrame() ?? ""),
    async press(...sequence: string[]) {
      for (const key of sequence) {
        instance.stdin.write(key);
        await tick();
      }
    },
  };
}
