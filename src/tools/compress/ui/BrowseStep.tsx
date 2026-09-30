import { useState } from "react";
import type { BtkContext } from "../../../context.ts";
import {
  FILE_BROWSER_HINTS,
  FileBrowser,
  Screen,
  type ScreenEntry,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { FORMATS, spec } from "../formats.ts";
import { optionsScreen } from "./OptionsStep.tsx";
import { decompressRunScreen } from "./RunStep.tsx";

type Props = { ctx: BtkContext; rootId: string };

const COMPRESSED = FORMATS.flatMap((format) => [spec(format).extension, ...spec(format).tarExtensions]);

function CompressBrowser({ ctx }: { ctx: BtkContext }) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  const [refreshToken, setRefreshToken] = useState(0);
  const onWritten = () => setRefreshToken((n) => n + 1);
  return (
    <Screen
      subtitle="Pick files to compress: space selects several, enter continues"
      hints={FILE_BROWSER_HINTS}
    >
      <FileBrowser
        root={ctx.cwd}
        multiple
        limit={Math.max(5, rows - 12)}
        refreshToken={refreshToken}
        onSubmit={(files) => nav.push(optionsScreen({ files, ctx, rootId: "compress:browse", onWritten }))}
      />
    </Screen>
  );
}

export function DecompressBrowser({ ctx, rootId }: Props) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  const [refreshToken, setRefreshToken] = useState(0);
  const onWritten = () => setRefreshToken((n) => n + 1);
  return (
    <Screen
      subtitle="Pick compressed files: space selects several, enter decompresses"
      hints={FILE_BROWSER_HINTS}
    >
      <FileBrowser
        root={ctx.cwd}
        extensions={COMPRESSED}
        multiple
        limit={Math.max(5, rows - 12)}
        refreshToken={refreshToken}
        onSubmit={(files) => nav.push(decompressRunScreen({ files, ctx, rootId, onWritten }))}
      />
    </Screen>
  );
}

export function compressBrowser(ctx: BtkContext): ScreenEntry {
  return {
    id: "compress:browse",
    title: "Compress",
    render: () => <CompressBrowser ctx={ctx} />,
  };
}

export function decompressBrowser(ctx: BtkContext, rootId: string): ScreenEntry {
  return {
    id: "decompress:browse",
    title: "Decompress",
    render: () => <DecompressBrowser ctx={ctx} rootId={rootId} />,
  };
}
