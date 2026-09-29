import { Box, Text } from "ink";
import { formatValue } from "../../output/format.ts";
import { colors } from "../../output/palette.ts";
import { padEndVisible, padStartVisible, visibleWidth } from "../../output/style.ts";

export type ResultColumn<R> = {
  key: keyof R & string;
  label?: string;
  align?: "left" | "right";
  color?: (row: R) => string | undefined;
};

export function ResultTable<R extends Record<string, unknown>>({
  columns,
  rows,
  limit,
}: {
  columns: ResultColumn<R>[];
  rows: R[];
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const cells = shown.map((row) => columns.map((c) => formatValue(row[c.key])));
  const widths = columns.map((c, i) =>
    Math.max(visibleWidth(c.label ?? c.key), ...cells.map((line) => visibleWidth(line[i] ?? ""))),
  );
  const pad = (text: string, i: number) =>
    columns[i]?.align === "right"
      ? padStartVisible(text, widths[i] ?? 0)
      : padEndVisible(text, widths[i] ?? 0);

  return (
    <Box flexDirection="column">
      <Box columnGap={2}>
        {columns.map((c, i) => (
          <Text key={c.key} color={colors.muted} bold>
            {pad(c.label ?? c.key, i)}
          </Text>
        ))}
      </Box>
      {shown.map((row, r) => (
        <Box key={`row-${r}`} columnGap={2}>
          {columns.map((c, i) => (
            <Text key={c.key} color={c.color?.(row)}>
              {pad(cells[r]?.[i] ?? "", i)}
            </Text>
          ))}
        </Box>
      ))}
      {limit && rows.length > limit ? <Text color={colors.muted}>… {rows.length - limit} more</Text> : null}
    </Box>
  );
}
