import { useState } from "react";
import type { ToolScreenProps } from "../../../cli/define.ts";
import {
  FILE_BROWSER_HINTS,
  FileBrowser,
  Screen,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { DATA_EXTENSIONS } from "../formats.ts";
import { formatScreen } from "./FormatStep.tsx";

export default function ConvertDashboard({ ctx }: ToolScreenProps) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  const [refreshToken, setRefreshToken] = useState(0);
  return (
    <Screen
      subtitle="Pick a data file, then a format to convert it to"
      hints={FILE_BROWSER_HINTS.filter((h) => h.key !== "space" && h.key !== "a")}
    >
      <FileBrowser
        root={ctx.cwd}
        extensions={DATA_EXTENSIONS}
        limit={Math.max(5, rows - 12)}
        refreshToken={refreshToken}
        onSubmit={([file]) =>
          file && nav.push(formatScreen({ file, ctx, onWritten: () => setRefreshToken((n) => n + 1) }))
        }
      />
    </Screen>
  );
}
