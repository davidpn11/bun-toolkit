import { Text } from "ink";
import { useEffect, useState } from "react";
import { colors } from "../../output/palette.ts";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text>
      <Text color={colors.accent}>{FRAMES[frame]}</Text>
      {label ? ` ${label}` : ""}
    </Text>
  );
}
