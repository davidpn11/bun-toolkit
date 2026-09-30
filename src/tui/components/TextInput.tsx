import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { colors, icons } from "../../output/palette.ts";
import { useNavigation, useScreenActive } from "../navigation.tsx";

export type TextInputProps = {
  label: string;
  onSubmit: (value: string) => void;
  /** Shows `•` for each character, for passwords. */
  mask?: boolean;
  placeholder?: string;
  isFocused?: boolean;
};

/**
 * One line of typed input. While it has focus it takes every key, including q and ?, except esc,
 * which still goes back.
 */
export function TextInput({ label, onSubmit, mask = false, placeholder, isFocused = true }: TextInputProps) {
  const active = useScreenActive() && isFocused;
  const { setInputLocked, canGoBack, pop } = useNavigation();
  const [value, setValue] = useState("");

  useEffect(() => {
    setInputLocked(active);
    return () => setInputLocked(false);
  }, [active, setInputLocked]);

  useInput(
    (input, key) => {
      if (key.escape) {
        if (canGoBack) pop();
      } else if (key.return) onSubmit(value);
      else if (key.backspace || key.delete) setValue((v) => v.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
    },
    { isActive: active },
  );

  const shown = mask ? "•".repeat(value.length) : value;
  return (
    <Box columnGap={1}>
      <Text color={colors.accent}>{icons.pointer}</Text>
      <Text bold>{label}</Text>
      {shown ? <Text>{shown}</Text> : <Text color={colors.muted}>{placeholder ?? ""}</Text>}
      {active ? <Text color={colors.accent}>▏</Text> : null}
    </Box>
  );
}
