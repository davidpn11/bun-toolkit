import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import type { BtkContext } from "../context.ts";
import { colors, icons } from "../output/palette.ts";
import { NAME, VERSION } from "../version.ts";
import { TuiProviders } from "./context.tsx";
import { NavigationProvider, type ScreenEntry, useNavigation } from "./navigation.tsx";

const GLOBAL_KEYS: [string, string][] = [
  ["↑↓ / j k", "Move"],
  ["enter", "Open, select or confirm"],
  ["esc", "Back to the previous screen"],
  ["?", "Toggle this help"],
  ["q", "Quit"],
  ["ctrl+c", "Quit from anywhere"],
];

function HelpOverlay() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={2} paddingY={1}>
      <Text color={colors.accent} bold>
        {icons.logo} {NAME} v{VERSION} · keys
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {GLOBAL_KEYS.map(([key, label]) => (
          <Box key={key} columnGap={2}>
            <Text color={colors.accent}>{key.padEnd(10)}</Text>
            <Text>{label}</Text>
          </Box>
        ))}
      </Box>
      <Text color={colors.muted}>Screens show their own keys in the footer. Press ? or esc to close.</Text>
    </Box>
  );
}

function Shell() {
  const nav = useNavigation();
  const [help, setHelp] = useState(false);

  useInput((input, key) => {
    if (key.ctrl && input === "c") return nav.quit();
    if (nav.inputLocked) return;
    if (help) {
      if (key.escape || input === "?" || input === "q") setHelp(false);
      return;
    }
    if (input === "?") setHelp(true);
    else if (input === "q") nav.quit();
    else if (key.escape && nav.canGoBack) nav.pop();
  });

  if (help) return <HelpOverlay />;
  return <Box key={nav.current.id}>{nav.current.render()}</Box>;
}

export type TuiAppProps = {
  ctx: BtkContext;
  initial: ScreenEntry;
  /** Called when the user quits. Defaults to Ink's `exit()`. */
  onQuit?: () => void;
};

export function TuiApp({ ctx, initial, onQuit }: TuiAppProps) {
  const { exit } = useApp();
  return (
    <TuiProviders ctx={ctx}>
      <NavigationProvider initial={initial} onQuit={onQuit ?? (() => exit())}>
        <Shell />
      </NavigationProvider>
    </TuiProviders>
  );
}
