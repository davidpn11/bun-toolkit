import { Box, Text } from "ink";
import { MASCOT_SPRITE, mascotPixels } from "../mascot.ts";

type Run = {
  text: string;
  color?: string;
  backgroundColor?: string;
};

/**
 * Two pixel rows per terminal row: `▀` takes the top pixel as its color and the bottom one as its background.
 * Neighboring cells with the same colors are merged so a line is a handful of `<Text>` nodes, not one per pixel.
 */
export function halfBlockLines(pixels: (string | null)[][]): Run[][] {
  const lines: Run[][] = [];
  for (let y = 0; y < pixels.length; y += 2) {
    const top = pixels[y] ?? [];
    const bottom = pixels[y + 1] ?? [];
    const runs: Run[] = [];
    for (let x = 0; x < top.length; x++) {
      const t = top[x] ?? null;
      const b = bottom[x] ?? null;
      const cell: Run =
        !t && !b
          ? { text: " " }
          : t === b
            ? { text: "█", color: t ?? undefined }
            : !b
              ? { text: "▀", color: t ?? undefined }
              : !t
                ? { text: "▄", color: b }
                : { text: "▀", color: t, backgroundColor: b };
      const last = runs.at(-1);
      if (
        last &&
        last.text.at(-1) === cell.text &&
        last.color === cell.color &&
        last.backgroundColor === cell.backgroundColor
      )
        last.text += cell.text;
      else runs.push(cell);
    }
    lines.push(runs);
  }
  return lines;
}

const LINES = halfBlockLines(mascotPixels());

/** Terminal columns and rows the mascot takes up. */
export const MASCOT_WIDTH = MASCOT_SPRITE[0]?.length ?? 0;
export const MASCOT_HEIGHT = LINES.length;

/** The btk mascot, drawn with half blocks. Needs a truecolor terminal to look right. */
export function Mascot() {
  return (
    <Box flexDirection="column" flexShrink={0}>
      {LINES.map((runs, y) => (
        <Text key={y}>
          {runs.map((run, x) => (
            <Text key={x} color={run.color} backgroundColor={run.backgroundColor}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
