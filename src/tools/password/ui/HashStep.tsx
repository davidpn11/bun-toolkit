import { Box, Text } from "ink";
import { useState } from "react";
import type { BtkContext } from "../../../context.ts";
import { formatDuration } from "../../../output/format.ts";
import { colors } from "../../../output/palette.ts";
import { Screen, type ScreenEntry, Spinner, StatusBar, TextInput } from "../../../tui/index.ts";
import { describeSettings, hashPassword } from "../hashing.ts";
import { passwordSettings } from "../tool.ts";

type Result = { hash?: string; ms?: number; error?: string };

function HashStep({ ctx }: { ctx: BtkContext }) {
  const settings = passwordSettings(ctx);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();

  const submit = async (value: string) => {
    setBusy(true);
    try {
      setResult(await hashPassword(value, settings));
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    }
    setBusy(false);
    setAttempt((n) => n + 1);
  };

  return (
    <Screen subtitle={describeSettings(settings)} hints={[{ key: "enter", label: "hash" }]}>
      <Box flexDirection="column" rowGap={1}>
        <TextInput key={attempt} label="Password" mask onSubmit={submit} isFocused={!busy} />
        {busy ? <Spinner label="Hashing…" /> : null}
        {result?.error ? <StatusBar tone="error" message={result.error} /> : null}
        {result?.hash ? (
          <Box flexDirection="column">
            <Text color={colors.muted}>Hash ({formatDuration(result.ms ?? 0)}), safe to store:</Text>
            <Text color={colors.accent} wrap="wrap">
              {result.hash}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Screen>
  );
}

export function hashScreen(ctx: BtkContext): ScreenEntry {
  return { id: "password:hash", title: "Hash", render: () => <HashStep ctx={ctx} /> };
}
