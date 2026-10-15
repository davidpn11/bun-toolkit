import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Box } from "ink";
import { useMemo } from "react";
import type { ToolScreenProps } from "../../../cli/define.ts";
import type { BtkContext } from "../../../context.ts";
import {
  FILE_BROWSER_HINTS,
  FileBrowser,
  Screen,
  type ScreenEntry,
  StatusBar,
  TEXT_VIEWER_HINTS,
  TextViewer,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { renderTerminal } from "../terminal/render.ts";
import { availableThemes, resolveTheme } from "../theme/resolve.ts";
import { mdSettings } from "../tool.ts";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const MAX_COLUMNS = 100;
const FRAME_COLUMNS = 6;
/** Header, subtitle, borders, key hints and the viewer's "Lines x to y" footer. */
const CHROME_ROWS = 7;

type Rendered = { theme: string; text: string } | { error: string };

export default function MdDashboard({ ctx }: ToolScreenProps) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  return (
    <Screen
      subtitle="Pick a markdown file to read it here"
      hints={FILE_BROWSER_HINTS.filter((h) => h.key !== "space" && h.key !== "a")}
    >
      <FileBrowser
        root={ctx.cwd}
        extensions={MARKDOWN_EXTENSIONS}
        limit={Math.max(5, rows - 12)}
        onSubmit={([file]) => file && nav.push(markdownScreen(file, ctx))}
      />
    </Screen>
  );
}

function MarkdownView({ file, ctx }: { file: string; ctx: BtkContext }) {
  const { columns, rows } = useTerminalSize();
  const width = Math.min(MAX_COLUMNS, columns - FRAME_COLUMNS);
  const rendered = useMemo(() => renderFile(file, width, ctx), [file, width, ctx]);
  const ok = !("error" in rendered);
  return (
    <Screen
      subtitle={ok ? `${basename(file)} · ${rendered.theme} theme` : basename(file)}
      hints={ok ? TEXT_VIEWER_HINTS : []}
    >
      <Box flexDirection="column">
        {ok ? (
          <TextViewer text={rendered.text} height={Math.max(5, rows - CHROME_ROWS)} gutter={false} />
        ) : (
          <StatusBar tone="error" message={rendered.error} />
        )}
      </Box>
    </Screen>
  );
}

function renderFile(file: string, width: number, ctx: BtkContext): Rendered {
  try {
    const theme = resolveTheme(mdSettings(ctx).theme, availableThemes(ctx.hooks));
    const text = renderTerminal(readFileSync(file, "utf8"), theme.terminal, {
      width,
      color: ctx.environment.color,
      hyperlinks: false,
    });
    return { theme: theme.name, text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function markdownScreen(file: string, ctx: BtkContext): ScreenEntry {
  return { id: "md:view", title: basename(file), render: () => <MarkdownView file={file} ctx={ctx} /> };
}
