import { render } from "ink";
import type { ToolDef } from "../cli/define.ts";
import type { BtkContext } from "../context.ts";
import { TuiApp } from "./app.tsx";
import { homeScreen } from "./screens/Home.tsx";
import { toolScreen } from "./screens/ToolHost.tsx";

const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[H";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";
const SHOW_CURSOR = "\x1b[?25h";

/**
 * Runs the TUI in the terminal's alternate screen, so the user's scrollback is untouched, and
 * always restores the terminal: on quit, on a crash, and on process exit.
 */
export async function runTui(ctx: BtkContext, tool?: ToolDef): Promise<void> {
  const stdout = ctx.io.stdout as NodeJS.WriteStream;
  const stdin = ctx.io.stdin as NodeJS.ReadStream;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
  };

  stdout.write(ENTER_ALT_SCREEN);
  process.once("exit", restore);
  try {
    const instance = render(<TuiApp ctx={ctx} initial={tool ? toolScreen(tool) : homeScreen} />, {
      stdout,
      stdin,
      stderr: ctx.io.stderr as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: true,
    });
    try {
      await instance.waitUntilExit();
    } finally {
      instance.unmount();
      instance.cleanup();
    }
  } finally {
    restore();
    process.off("exit", restore);
  }
}
