import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { colors } from "../../output/palette.ts";
import { useScreenActive } from "../navigation.tsx";

export type TextViewerProps = {
  text: string;
  height: number;
  isFocused?: boolean;
  gutter?: boolean;
};

export const TEXT_VIEWER_HINTS = [
  { key: "↑↓", label: "scroll" },
  { key: "pgup/pgdn", label: "page" },
];

export function TextViewer({ text, height, isFocused = true, gutter = true }: TextViewerProps) {
  const screenActive = useScreenActive();
  const lines = text.replace(/\n$/, "").split("\n");
  const maxOffset = Math.max(0, lines.length - height);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset((current) => Math.min(current, maxOffset));
  }, [maxOffset]);

  useInput(
    (input, key) => {
      const move = (delta: number) =>
        setOffset((current) => Math.max(0, Math.min(maxOffset, current + delta)));
      if (key.upArrow || input === "k") move(-1);
      else if (key.downArrow || input === "j") move(1);
      else if (key.pageUp) move(-height);
      else if (key.pageDown || input === " ") move(height);
      else if (key.home) setOffset(0);
      else if (key.end) setOffset(maxOffset);
    },
    { isActive: isFocused && screenActive },
  );

  const visible = lines.slice(offset, offset + height);
  const gutterWidth = String(lines.length).length;
  return (
    <Box flexDirection="column">
      {visible.map((line, i) => (
        <Box key={`${offset + i}`} columnGap={1}>
          {gutter ? <Text color={colors.muted}>{String(offset + i + 1).padStart(gutterWidth)}</Text> : null}
          <Text wrap="truncate-end">{line || " "}</Text>
        </Box>
      ))}
      {lines.length > height ? (
        <Text color={colors.muted}>
          Lines {offset + 1} to {offset + visible.length} of {lines.length}
        </Text>
      ) : null}
    </Box>
  );
}
