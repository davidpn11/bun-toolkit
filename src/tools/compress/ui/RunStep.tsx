import { Box, useInput } from "ink";
import { useEffect, useState } from "react";
import { colors } from "../../../output/palette.ts";
import {
  ResultTable,
  Screen,
  type ScreenEntry,
  Spinner,
  StatusBar,
  useNavigation,
  useScreenActive,
} from "../../../tui/index.ts";
import { type CompressPlan, type CompressReport, compressInputs } from "../compress.ts";
import { type DecompressReport, decompressInputs } from "../decompress.ts";
import { compressRow, decompressRow } from "../render.ts";
import type { StepProps } from "./OptionsStep.tsx";

type Row = Record<string, unknown>;
type Outcome = { rows: Row[]; done: number; skipped: number; failed: number } | { error: string };

function stateColor(row: Row): string {
  return row.state === "done" ? colors.success : row.state === "failed" ? colors.error : colors.muted;
}

function useRun(start: () => Promise<Outcome>, onWritten: () => void): Outcome | undefined {
  const [outcome, setOutcome] = useState<Outcome>();
  useEffect(() => {
    let alive = true;
    start().then(
      (result) => {
        if ("done" in result && result.done > 0) onWritten();
        if (alive) setOutcome(result);
      },
      (error: unknown) =>
        alive && setOutcome({ error: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, [start, onWritten]);
  return outcome;
}

function RunView({
  title,
  outcome,
  rootId,
  hasChange,
}: {
  title: string;
  outcome?: Outcome;
  rootId: string;
  hasChange: boolean;
}) {
  const nav = useNavigation();
  const active = useScreenActive();
  useInput(
    (_input, key) => {
      if (key.return && outcome) nav.popTo(rootId);
    },
    { isActive: active },
  );
  if (!outcome)
    return (
      <Screen subtitle={title}>
        <Spinner label="Working…" />
      </Screen>
    );
  if ("error" in outcome)
    return (
      <Screen subtitle={title} hints={[{ key: "enter", label: "pick more files" }]}>
        <StatusBar tone="error" message={outcome.error} />
      </Screen>
    );
  const tone = outcome.failed > 0 ? "warning" : "success";
  return (
    <Screen subtitle={title} hints={[{ key: "enter", label: "pick more files" }]}>
      <Box flexDirection="column" rowGap={1}>
        <StatusBar
          tone={tone}
          message={`${outcome.done} done · ${outcome.skipped} skipped · ${outcome.failed} failed`}
        />
        <ResultTable
          columns={[
            { key: "status", label: " ", color: stateColor },
            { key: "file" },
            { key: "output", color: () => colors.muted },
            { key: "size", align: "right" },
            ...(hasChange
              ? [
                  {
                    key: "change",
                    align: "right" as const,
                    color: (row: Row) => colors[row.tone as "success"],
                  },
                ]
              : []),
            { key: "note", color: () => colors.muted },
          ]}
          rows={outcome.rows}
          limit={15}
        />
      </Box>
    </Screen>
  );
}

function CompressRun({ files, ctx, rootId, onWritten, plan }: StepProps & { plan: CompressPlan }) {
  const [start] = useState(() => async () => {
    const report: CompressReport = await compressInputs(files, ctx.cwd, plan);
    return { rows: report.results.map((r) => compressRow(r, ctx.cwd)), ...report.totals };
  });
  const outcome = useRun(start, onWritten);
  return (
    <RunView
      title={`${plan.formats.join(", ")}${plan.dryRun ? " · dry run" : ""}`}
      outcome={outcome}
      rootId={rootId}
      hasChange
    />
  );
}

function DecompressRun({ files, ctx, rootId, onWritten }: StepProps) {
  const [start] = useState(() => async () => {
    const report: DecompressReport = await decompressInputs(files, ctx.cwd, {
      overwrite: false,
      dryRun: false,
      recursive: false,
    });
    return { rows: report.results.map((r) => decompressRow(r, ctx.cwd)), ...report.totals };
  });
  const outcome = useRun(start, onWritten);
  return <RunView title="Decompress" outcome={outcome} rootId={rootId} hasChange={false} />;
}

export function compressRunScreen(props: StepProps, plan: CompressPlan): ScreenEntry {
  return { id: "compress:run", title: "Results", render: () => <CompressRun {...props} plan={plan} /> };
}

export function decompressRunScreen(props: StepProps): ScreenEntry {
  return { id: "decompress:run", title: "Results", render: () => <DecompressRun {...props} /> };
}
