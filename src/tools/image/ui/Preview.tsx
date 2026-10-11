import { basename } from "node:path";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { formatBytes, formatDimensions } from "../../../output/format.ts";
import { colors, icons } from "../../../output/palette.ts";
import { Spinner } from "../../../tui/index.ts";
import { describeImageError } from "../errors.ts";
import { type ImageInfo, readImageInfo } from "../info.ts";

type State = { path?: string; info?: ImageInfo; error?: string };

function useImageInfo(path: string | undefined): State {
  const [state, setState] = useState<State>({});
  useEffect(() => {
    if (!path) {
      setState({});
      return;
    }
    let alive = true;
    setState({ path });
    readImageInfo(path).then(
      (info) => alive && setState({ path, info }),
      (error: unknown) => alive && setState({ path, error: describeImageError(error).message }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

export function Preview({ path, width = 34 }: { path?: string | undefined; width?: number }) {
  const { info, error } = useImageInfo(path);
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={colors.muted} paddingX={1}>
      <Text color={colors.muted} bold>
        Preview
      </Text>
      {!path ? <Text color={colors.muted}>Highlight an image</Text> : null}
      {path && !info && !error ? <Spinner label="Reading…" /> : null}
      {error ? (
        <Text color={colors.error}>
          {icons.error} {error}
        </Text>
      ) : null}
      {info ? <Details info={info} /> : null}
    </Box>
  );
}

function Details({ info }: { info: ImageInfo }) {
  const rows: [string, string][] = [
    ["format", info.format.toUpperCase()],
    ["pixels", formatDimensions(info.width, info.height)],
    ["", `${info.megapixels} MP`],
    ["size", formatBytes(info.bytes)],
  ];
  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-middle">
        {basename(info.path)}
      </Text>
      {rows.map(([label, value]) => (
        <Box key={label} columnGap={1}>
          <Text color={colors.muted}>{label.padEnd(6)}</Text>
          <Text>{value}</Text>
        </Box>
      ))}
    </Box>
  );
}
