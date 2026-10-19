import ansis from "ansis";
import { Box, Text } from "ink";
import { registeredTools, type ToolDef } from "../../cli/define.ts";
import { colors } from "../../output/palette.ts";
import { MASCOT_HEIGHT, MASCOT_WIDTH, Mascot } from "../components/Mascot.tsx";
import { Screen } from "../components/Screen.tsx";
import { type SelectItem, SelectList } from "../components/SelectList.tsx";
import { useBtk } from "../context.tsx";
import { useTerminalSize } from "../hooks/use-terminal-size.ts";
import { type ScreenEntry, useNavigation } from "../navigation.tsx";
import { configScreen } from "./ConfigScreen.tsx";
import { infoScreen } from "./InfoScreen.tsx";
import { toolScreen } from "./ToolHost.tsx";

type HomeValue = { kind: "tool"; tool: ToolDef } | { kind: "screen"; screen: ScreenEntry } | { kind: "quit" };

export function Home() {
  const ctx = useBtk();
  const nav = useNavigation();
  const tools = registeredTools(ctx.registry);
  const { columns, rows } = useTerminalSize();
  const showMascot = canShowMascot(columns, rows, ansis.level);

  const items: SelectItem<HomeValue>[] = [
    ...tools.map((tool) => ({
      value: { kind: "tool" as const, tool },
      label: tool.name,
      description: tool.description,
      section: "Tools",
      ...(!tool.ui && { tag: "cli only", disabled: true }),
    })),
    {
      value: { kind: "screen", screen: infoScreen },
      label: "Info",
      description: "Versions, platform and config status",
      section: "General",
    },
    {
      value: { kind: "screen", screen: configScreen },
      label: "Config",
      description: "Resolved config and validation",
      section: "General",
    },
    { value: { kind: "quit" }, label: "Quit", section: "General" },
  ];

  const select = (item: SelectItem<HomeValue>) => {
    const { value } = item;
    if (value.kind === "tool") nav.push(toolScreen(value.tool));
    else if (value.kind === "screen") nav.push(value.screen);
    else nav.quit();
  };

  return (
    <Screen
      subtitle="Bun native APIs straight in your terminal"
      hints={[
        { key: "↑↓", label: "move" },
        { key: "enter", label: "open" },
      ]}
    >
      <Box columnGap={4}>
        <Box flexDirection="column" rowGap={1} flexGrow={1}>
          {tools.length === 0 ? (
            <Box flexDirection="column">
              <Text bold>No tools installed yet</Text>
              <Text color={colors.muted}>
                Tools like image, hash and convert will show up here as they are added.
              </Text>
            </Box>
          ) : null}
          <SelectList items={items} onSelect={select} limit={12} />
        </Box>
        {showMascot ? <Mascot /> : null}
      </Box>
    </Screen>
  );
}

/** A 16-color terminal rounds the sprite's colors into blocks, so it needs 256 colors (`colorLevel` 2) or more. */
export function canShowMascot(columns: number, rows: number, colorLevel: number): boolean {
  return colorLevel >= 2 && columns >= MASCOT_WIDTH + 60 && rows >= MASCOT_HEIGHT + 10;
}

export const homeScreen: ScreenEntry = { id: "home", title: "Home", render: () => <Home /> };
