import type { ToolScreenProps } from "../../../cli/define.ts";
import {
  FILE_BROWSER_HINTS,
  FileBrowser,
  Screen,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { algorithmScreen } from "./AlgorithmStep.tsx";

export default function HashDashboard({ ctx }: ToolScreenProps) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  return (
    <Screen subtitle="Pick files: space selects several, enter continues" hints={FILE_BROWSER_HINTS}>
      <FileBrowser
        root={ctx.cwd}
        multiple
        limit={Math.max(5, rows - 12)}
        onSubmit={(files) => nav.push(algorithmScreen({ files, ctx }))}
      />
    </Screen>
  );
}
