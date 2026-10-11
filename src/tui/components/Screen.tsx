import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { colors, icons } from "../../output/palette.ts";
import { NAME } from "../../version.ts";
import { useTerminalSize } from "../hooks/use-terminal-size.ts";
import { useNavigation } from "../navigation.tsx";
import { type KeyHint, KeyHints } from "./KeyHints.tsx";

export type ScreenProps = {
  subtitle?: string;
  /** Screen-specific key hints; global ones (back, help, quit) are appended. */
  hints?: KeyHint[];
  aside?: ReactNode;
  children: ReactNode;
};

/** One row short of the terminal so Ink never has to clear the screen between frames. */
export function Screen({ subtitle, hints = [], aside, children }: ScreenProps) {
  const nav = useNavigation();
  const { columns, rows } = useTerminalSize();

  const crumbs = nav.stack.map((entry) => entry.title);
  const globalHints: KeyHint[] = [
    ...(nav.canGoBack ? [{ key: "esc", label: "back" }] : []),
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ];

  return (
    <Box flexDirection="column" width={columns} height={Math.max(8, rows - 1)} paddingX={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text color={colors.accent} bold>
            {icons.logo} {NAME}
          </Text>
          {crumbs.map((crumb, i) => (
            <Text key={`${crumb}-${i}`} color={i === crumbs.length - 1 ? undefined : colors.muted}>
              <Text color={colors.muted}> {icons.pointer} </Text>
              {crumb}
            </Text>
          ))}
        </Text>
        {aside ? <Box>{aside}</Box> : null}
      </Box>
      {subtitle ? <Text color={colors.muted}>{subtitle}</Text> : null}
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderColor={colors.accent}
        paddingX={1}
        marginTop={subtitle ? 0 : 1}
        overflow="hidden"
      >
        {children}
      </Box>
      <KeyHints hints={[...hints, ...globalHints]} />
    </Box>
  );
}
