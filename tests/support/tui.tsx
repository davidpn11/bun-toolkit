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

/** Renders a component inside the TUI providers, as it would be on a real screen. */
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
    /** Last frame without ANSI codes. */
    frame: () => stripAnsi(instance.lastFrame() ?? ""),
    /** Sends keys one at a time, letting React re-render between them. */
    async press(...sequence: string[]) {
      for (const key of sequence) {
        instance.stdin.write(key);
        await tick();
      }
    },
  };
}
