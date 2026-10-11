import { Box, Text } from "ink";
import { colors, icons } from "../../output/palette.ts";
import { Spinner } from "./Spinner.tsx";

export type ItemStatus = "pending" | "running" | "done" | "error" | "skipped";

export type ProgressItem = {
  id: string;
  label: string;
  status: ItemStatus;
  detail?: string;
};

export function ProgressBar({
  current,
  total,
  width = 30,
}: {
  current: number;
  total: number;
  width?: number;
}) {
  const ratio = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(ratio * width);
  return (
    <Text>
      <Text color={colors.accent}>{"█".repeat(filled)}</Text>
      <Text color={colors.muted}>{"░".repeat(width - filled)}</Text>
      <Text>
        {" "}
        {current}/{total}
      </Text>
    </Text>
  );
}

export function ProgressList({ items, limit = 12 }: { items: ProgressItem[]; limit?: number }) {
  const finished = items.filter(
    (i) => i.status === "done" || i.status === "error" || i.status === "skipped",
  ).length;
  const running = items.findIndex((i) => i.status === "running");
  const start = Math.max(0, Math.min(running === -1 ? finished - limit : running - 2, items.length - limit));
  const visible = items.slice(start, start + limit);

  return (
    <Box flexDirection="column">
      <ProgressBar current={finished} total={items.length} />
      <Box flexDirection="column" marginTop={1}>
        {visible.map((item) => (
          <Box key={item.id} columnGap={1}>
            {item.status === "running" ? (
              <Spinner />
            ) : (
              <Text
                color={
                  item.status === "done"
                    ? colors.success
                    : item.status === "error"
                      ? colors.error
                      : colors.muted
                }
              >
                {item.status === "done"
                  ? icons.success
                  : item.status === "error"
                    ? icons.error
                    : item.status === "skipped"
                      ? "–"
                      : "·"}
              </Text>
            )}
            <Box flexGrow={1}>
              <Text color={item.status === "pending" ? colors.muted : undefined}>{item.label}</Text>
            </Box>
            {item.detail ? (
              <Text color={item.status === "error" ? colors.error : colors.muted}>{item.detail}</Text>
            ) : null}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
