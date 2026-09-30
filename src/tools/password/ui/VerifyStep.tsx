import { Box, Text } from "ink";
import { useState } from "react";
import type { BtkContext } from "../../../context.ts";
import { colors, icons } from "../../../output/palette.ts";
import { Screen, type ScreenEntry, StatusBar, TextInput } from "../../../tui/index.ts";
import { verifyPassword } from "../hashing.ts";
import { inspectHash, parseHash } from "../inspect.ts";
import { passwordSettings } from "../tool.ts";

type Outcome = { match: boolean; weaker: string[] } | { error: string };

function VerifyStep({ ctx }: { ctx: BtkContext }) {
  const [hash, setHash] = useState<string>();
  const [hashError, setHashError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>();

  const acceptHash = (value: string) => {
    try {
      parseHash(value);
      setHash(value.trim());
      setHashError(undefined);
    } catch (error) {
      setHashError(error instanceof Error ? error.message : String(error));
    }
  };

  const check = async (value: string) => {
    try {
      const match = await verifyPassword(value, hash ?? "");
      setOutcome({ match, weaker: match ? inspectHash(hash ?? "", passwordSettings(ctx)).weaker : [] });
    } catch (error) {
      setOutcome({ error: error instanceof Error ? error.message : String(error) });
    }
    setAttempt((n) => n + 1);
  };

  return (
    <Screen
      subtitle="Paste the stored hash, then type the password"
      hints={[{ key: "enter", label: "next" }]}
    >
      <Box flexDirection="column" rowGap={1}>
        {hash ? (
          <Text color={colors.muted} wrap="truncate-middle">
            Hash {hash}
          </Text>
        ) : (
          <TextInput label="Hash" placeholder="$argon2id$… or $2b$…" onSubmit={acceptHash} />
        )}
        {hashError ? <StatusBar tone="error" message={hashError} /> : null}
        {hash ? <TextInput key={attempt} label="Password" mask onSubmit={check} /> : null}
        {outcome ? <OutcomeView outcome={outcome} /> : null}
      </Box>
    </Screen>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  if ("error" in outcome) return <StatusBar tone="error" message={outcome.error} />;
  if (!outcome.match) return <StatusBar tone="error" message="The password does not match" />;
  return (
    <Box flexDirection="column">
      <StatusBar tone="success" message="The password matches" />
      {outcome.weaker.map((reason) => (
        <Text key={reason} color={colors.warning}>
          {icons.warning} Weaker than your settings: {reason}
        </Text>
      ))}
    </Box>
  );
}

export function verifyScreen(ctx: BtkContext): ScreenEntry {
  return { id: "password:verify", title: "Check", render: () => <VerifyStep ctx={ctx} /> };
}
