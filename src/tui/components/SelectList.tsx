import { Box, Text, useInput } from "ink";
import { useEffect, useRef } from "react";
import { colors, icons } from "../../output/palette.ts";
import { useListCursor } from "../hooks/use-list-cursor.ts";
import { useScreenActive } from "../navigation.tsx";

export type SelectItem<V> = {
  value: V;
  label: string;
  description?: string;
  tag?: string;
  /** Group heading. A heading is drawn whenever it changes from the previous row. */
  section?: string;
  disabled?: boolean;
};

export type SelectListProps<V> = {
  items: SelectItem<V>[];
  onSelect: (item: SelectItem<V>) => void;
  onHighlight?: (item: SelectItem<V> | undefined) => void;
  /** Visible rows before scrolling. */
  limit?: number;
  isFocused?: boolean;
  initialIndex?: number;
  emptyText?: string;
};

/** Arrow-key list with a scroll window. ↑↓ / j k move, PgUp/PgDn jump, Home/End, Enter selects. */
export function SelectList<V>({
  items,
  onSelect,
  onHighlight,
  limit = 10,
  isFocused = true,
  initialIndex = 0,
  emptyText = "Nothing here",
}: SelectListProps<V>) {
  const screenActive = useScreenActive();
  const firstEnabled = Math.max(
    0,
    items.findIndex((item) => !item.disabled),
  );
  const cursor = useListCursor(items.length, limit, {
    initial: items[initialIndex]?.disabled ? firstEnabled : initialIndex,
    isDisabled: (i) => items[i]?.disabled === true,
  });

  const highlighted = items[cursor.index];
  // Report by index so a parent that re-creates `items` every render does not loop.
  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    onHighlightRef.current?.(itemsRef.current[cursor.index]);
  }, [cursor.index, items.length]);

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") cursor.move(-1);
      else if (key.downArrow || input === "j") cursor.move(1);
      else if (key.pageUp) cursor.move(-limit);
      else if (key.pageDown) cursor.move(limit);
      else if (key.home) cursor.moveTo(firstEnabled);
      else if (key.end) cursor.move(items.length);
      else if (key.return && highlighted && !highlighted.disabled) onSelect(highlighted);
    },
    { isActive: isFocused && screenActive },
  );

  if (items.length === 0) return <Text color={colors.muted}>{emptyText}</Text>;

  const visible = items.slice(cursor.offset, cursor.offset + limit);
  const above = cursor.offset;
  const below = Math.max(0, items.length - cursor.offset - limit);

  const labelWidth = Math.max(
    ...items.map((item) => item.label.length + (item.tag ? item.tag.length + 3 : 0)),
  );

  return (
    <Box flexDirection="column">
      {above > 0 ? <Text color={colors.muted}> ↑ {above} more</Text> : null}
      {visible.map((item, i) => {
        const index = cursor.offset + i;
        const active = index === cursor.index;
        const color = item.disabled ? colors.muted : active ? colors.accent : undefined;
        const heading = item.section && (i === 0 || items[index - 1]?.section !== item.section);
        const tag = item.tag ? ` [${item.tag}]` : "";
        return (
          <Box key={`${index}-${item.label}`} flexDirection="column">
            {heading ? (
              <Box marginTop={i === 0 ? 0 : 1}>
                <Text color={colors.muted} bold>
                  {item.section}
                </Text>
              </Box>
            ) : null}
            <Box columnGap={1}>
              <Text color={colors.accent}>{active ? icons.pointer : " "}</Text>
              <Text color={color} bold={active && !item.disabled}>
                {item.label}
                <Text color={colors.muted}>{tag}</Text>
                {" ".repeat(Math.max(0, labelWidth - item.label.length - tag.length))}
              </Text>
              {item.description ? <Text color={colors.muted}>{item.description}</Text> : null}
            </Box>
          </Box>
        );
      })}
      {below > 0 ? <Text color={colors.muted}> ↓ {below} more</Text> : null}
    </Box>
  );
}
