import { Box, Text } from "ink";
import { colors } from "../../output/palette.ts";

export type KeyHint = {
  key: string;
  label: string;
};

export function KeyHints({ hints }: { hints: KeyHint[] }) {
  return (
    <Box flexWrap="wrap" columnGap={2}>
      {hints.map((hint) => (
        <Text key={`${hint.key}-${hint.label}`}>
          <Text color={colors.accent} bold>
            {hint.key}
          </Text>
          <Text color={colors.muted}> {hint.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
