import { Box, Text } from "ink";
import { configRows, sourceText } from "../../commands/config.ts";
import { colors } from "../../output/palette.ts";
import { ResultTable } from "../components/ResultTable.tsx";
import { Screen } from "../components/Screen.tsx";
import { StatusBar } from "../components/StatusBar.tsx";
import { useBtk } from "../context.tsx";
import type { ScreenEntry } from "../navigation.tsx";

export function ConfigScreen() {
  const ctx = useBtk();
  const { configInfo } = ctx;
  const rows = configRows(ctx).map((row) => ({
    key: row.key,
    value: row.value,
    source: sourceText(row, ctx),
  }));
  const files = [configInfo.files.global, configInfo.files.project].filter((f) => f !== undefined);

  return (
    <Screen subtitle="Resolved configuration and where each value comes from">
      <Box flexDirection="column" rowGap={1}>
        {configInfo.error ? (
          <Box flexDirection="column">
            <StatusBar tone="error" message={configInfo.error.message} />
            {configInfo.error.details.map((line) => (
              <Text key={line} color={colors.muted}>
                {"  "}
                {line}
              </Text>
            ))}
          </Box>
        ) : (
          <StatusBar
            tone="success"
            message={
              files.length > 0
                ? `Valid: ${files.map((f) => f.displayPath).join(", ")}`
                : "No config files; built-in defaults apply"
            }
          />
        )}
        {rows.length > 0 ? (
          <ResultTable
            columns={[
              { key: "key" },
              { key: "value" },
              { key: "source", color: (row) => (row.source === "default" ? colors.muted : colors.accent) },
            ]}
            rows={rows}
          />
        ) : (
          <Text color={colors.muted}>No values set. Create a config with `btk init`.</Text>
        )}
      </Box>
    </Screen>
  );
}

export const configScreen: ScreenEntry = { id: "config", title: "Config", render: () => <ConfigScreen /> };
