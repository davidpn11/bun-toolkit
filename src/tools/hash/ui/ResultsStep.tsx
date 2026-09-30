import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { formatBytes, formatDuration, pluralize } from "../../../output/format.ts";
import { colors, icons } from "../../../output/palette.ts";
import { Screen, type ScreenEntry, Spinner, StatusBar, useTerminalSize } from "../../../tui/index.ts";
import type { Algorithm } from "../algorithms.ts";
import { type HashReport, hashAll } from "../compute.ts";
import { sumsPath } from "../render.ts";
import { hashSettings } from "../tool.ts";
import type { StepProps } from "./AlgorithmStep.tsx";

function ResultsStep({ files, ctx, algorithm }: StepProps & { algorithm: Algorithm }) {
  const [report, setReport] = useState<HashReport>();

  useEffect(() => {
    const controller = new AbortController();
    const collected = { files: files.map((path) => ({ path, base: ctx.cwd })), missing: [], ignored: [] };
    hashAll(
      { collected },
      { algorithm, encoding: hashSettings(ctx).encoding },
      { signal: controller.signal },
    ).then((result) => controller.signal.aborted || setReport(result));
    return () => controller.abort();
  }, [files, ctx, algorithm]);

  return (
    <Screen subtitle={`${algorithm} · ${pluralize(files.length, "file")}`}>
      {report ? <Digests report={report} cwd={ctx.cwd} /> : <Spinner label="Hashing…" />}
    </Screen>
  );
}

function Digests({ report, cwd }: { report: HashReport; cwd: string }) {
  const { rows } = useTerminalSize();
  const { hashed, failed, bytes } = report.totals;
  const limit = Math.max(2, Math.floor((rows - 12) / 2));
  const hidden = report.results.length - limit;
  return (
    <Box flexDirection="column" rowGap={1}>
      <StatusBar
        tone={failed > 0 ? "warning" : "success"}
        message={`${pluralize(hashed, "file")} · ${formatBytes(bytes)} · ${formatDuration(report.durationMs)}${failed > 0 ? ` · ${failed} failed` : ""}`}
      />
      <Box flexDirection="column">
        {report.results.slice(0, limit).map((result) => (
          <Box key={result.file} flexDirection="column">
            <Text bold>{sumsPath(result.file, cwd)}</Text>
            {result.status === "ok" ? (
              <Text color={colors.accent} wrap="wrap">
                {"  "}
                {result.digest}
              </Text>
            ) : (
              <Text color={colors.error}>
                {"  "}
                {icons.error} {result.reason}
              </Text>
            )}
          </Box>
        ))}
        {hidden > 0 ? <Text color={colors.muted}>{hidden} more. `btk hash` prints them all.</Text> : null}
      </Box>
    </Box>
  );
}

export function resultsScreen(props: StepProps, algorithm: Algorithm): ScreenEntry {
  return {
    id: "hash:results",
    title: "Results",
    render: () => <ResultsStep {...props} algorithm={algorithm} />,
  };
}
