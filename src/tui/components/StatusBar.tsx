import { Text } from "ink";
import { colors, icons } from "../../output/palette.ts";

export type Tone = "info" | "success" | "warning" | "error";

export function StatusBar({ tone = "info", message }: { tone?: Tone; message: string }) {
  const icon = {
    info: icons.info,
    success: icons.success,
    warning: icons.warning,
    error: icons.error,
  }[tone];
  const color = {
    info: colors.accent,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  }[tone];
  return (
    <Text>
      <Text color={color}>{icon}</Text> {message}
    </Text>
  );
}
