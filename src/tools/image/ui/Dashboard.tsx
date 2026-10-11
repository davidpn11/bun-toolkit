import { Box } from "ink";
import { useState } from "react";
import type { ToolScreenProps } from "../../../cli/define.ts";
import {
  FILE_BROWSER_HINTS,
  FileBrowser,
  Screen,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { IMAGE_EXTENSIONS } from "../formats.ts";
import { optionsScreen } from "./OptionsStep.tsx";
import { Preview } from "./Preview.tsx";

export default function ImageDashboard({ ctx, tool }: ToolScreenProps) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  const [highlighted, setHighlighted] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);

  const openOptions = (files: string[]) =>
    nav.push(
      optionsScreen({
        files,
        ctx,
        rootId: `tool:${tool.name}`,
        onWritten: () => setRefreshToken((n) => n + 1),
      }),
    );

  return (
    <Screen subtitle="Pick images: space selects several, enter continues" hints={FILE_BROWSER_HINTS}>
      <Box columnGap={2}>
        <Box flexGrow={1} flexDirection="column">
          <FileBrowser
            root={ctx.cwd}
            extensions={IMAGE_EXTENSIONS}
            multiple
            limit={Math.max(5, rows - 12)}
            refreshToken={refreshToken}
            onSubmit={openOptions}
            onHighlight={(entry) => setHighlighted(entry?.path)}
          />
        </Box>
        <Preview path={highlighted} />
      </Box>
    </Screen>
  );
}
