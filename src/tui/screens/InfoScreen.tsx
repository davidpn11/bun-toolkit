import { Box, Text } from "ink";
import { collectInfo, describeConfigFile } from "../../commands/info.ts";
import { colors } from "../../output/palette.ts";
import { Screen } from "../components/Screen.tsx";
import { useBtk } from "../context.tsx";
import type { ScreenEntry } from "../navigation.tsx";

export function InfoScreen() {
  const ctx = useBtk();
  const info = collectInfo(ctx);
  const { files } = ctx.configInfo;

  const rows: [string, string, string?][] = [
    ["bun-toolkit", info.version],
    ["bun", info.bun],
    ["platform", `${info.platform}-${info.arch}`],
    ["output", info.outputMode, info.outputReason],
    [
      "global config",
      describeConfigFile(info.config.global, files.global?.displayPath),
      info.config.global.status === "missing" ? info.globalConfigDir : undefined,
    ],
    ["project config", describeConfigFile(info.config.project, files.project?.displayPath)],
    ["tools", info.tools.length > 0 ? info.tools.join(", ") : "none installed yet"],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));

  return (
    <Screen subtitle="Versions, platform and config status">
      <Box flexDirection="column">
        {rows.map(([key, value, note]) => (
          <Box key={key} columnGap={2}>
            <Text color={colors.muted}>{key.padEnd(width)}</Text>
            <Text>{value}</Text>
            {note ? <Text color={colors.muted}>{note}</Text> : null}
          </Box>
        ))}
      </Box>
    </Screen>
  );
}

export const infoScreen: ScreenEntry = { id: "info", title: "Info", render: () => <InfoScreen /> };
