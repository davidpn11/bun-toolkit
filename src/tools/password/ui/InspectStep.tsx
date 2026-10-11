import { Box, Text } from "ink";
import { useState } from "react";
import type { BtkContext } from "../../../context.ts";
import { colors, icons } from "../../../output/palette.ts";
import { Screen, type ScreenEntry, StatusBar, TextInput } from "../../../tui/index.ts";
import { type Inspection, inspectHash } from "../inspect.ts";
import { passwordSettings } from "../tool.ts";

function InspectStep({ ctx }: { ctx: BtkContext }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Inspection | { error: string }>();

  const inspect = (value: string) => {
    try {
      setResult(inspectHash(value, passwordSettings(ctx)));
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    }
    setAttempt((n) => n + 1);
  };

  return (
    <Screen subtitle="Paste a hash to see how it was made" hints={[{ key: "enter", label: "inspect" }]}>
      <Box flexDirection="column" rowGap={1}>
        <TextInput key={attempt} label="Hash" placeholder="$argon2id$… or $2b$…" onSubmit={inspect} />
        {result && "error" in result ? <StatusBar tone="error" message={result.error} /> : null}
        {result && !("error" in result) ? <Details inspection={result} /> : null}
      </Box>
    </Screen>
  );
}

function Details({ inspection }: { inspection: Inspection }) {
  const rows: [string, string][] =
    inspection.algorithm === "bcrypt"
      ? [
          ["algorithm", "bcrypt"],
          ["cost", String(inspection.cost)],
        ]
      : [
          ["algorithm", inspection.algorithm],
          ["memory", `${inspection.memoryCost} KiB`],
          ["passes", String(inspection.timeCost)],
          ["parallelism", String(inspection.parallelism)],
        ];
  return (
    <Box flexDirection="column">
      {rows.map(([label, value]) => (
        <Box key={label} columnGap={2}>
          <Text color={colors.muted}>{label.padEnd(11)}</Text>
          <Text>{value}</Text>
        </Box>
      ))}
      {inspection.weaker.length === 0 ? (
        <Text color={colors.success}>{icons.success} As strong as your settings or stronger</Text>
      ) : (
        inspection.weaker.map((reason) => (
          <Text key={reason} color={colors.warning}>
            {icons.warning} {reason}
          </Text>
        ))
      )}
    </Box>
  );
}

export function inspectScreen(ctx: BtkContext): ScreenEntry {
  return { id: "password:inspect", title: "Inspect", render: () => <InspectStep ctx={ctx} /> };
}
