import { dirname, relative } from "node:path";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { displayPath } from "../../../config/loader.ts";
import { formatBytes, formatChange, formatDuration } from "../../../output/format.ts";
import { colors } from "../../../output/palette.ts";
import {
  type ProgressItem,
  ProgressList,
  ResultTable,
  Screen,
  type ScreenEntry,
  StatusBar,
  useNavigation,
  useScreenActive,
} from "../../../tui/index.ts";
import type { ImageFile } from "../collect.ts";
import { type FileResult, type OptimizeProgress, type OptimizeReport, optimizeImages } from "../optimize.ts";
import { describeOptions, type OptimizeOptions } from "../options.ts";
import { fileRow } from "../present.ts";
import type { StepProps } from "./OptionsStep.tsx";

function toImageFiles(paths: string[], cwd: string): ImageFile[] {
  return paths.map((path) => ({ path, base: relative(cwd, path).startsWith("..") ? dirname(path) : cwd }));
}

function itemDetail(result: FileResult): string {
  if (result.status === "converted")
    return `${formatBytes(result.after?.bytes ?? 0)}  ${formatChange(result.savedPercent ?? 0)}`;
  return result.reason ?? result.status;
}

function applyProgress(items: ProgressItem[], event: OptimizeProgress): ProgressItem[] {
  return items.map((item, i) => {
    if (i !== event.index) return item;
    if (event.type === "start") return { ...item, status: "running" };
    const result = event.result as FileResult;
    const status = result.status === "converted" ? "done" : result.status === "failed" ? "error" : "skipped";
    return { ...item, status, detail: itemDetail(result) };
  });
}

function RunStep({ files, ctx, rootId, onWritten, options }: StepProps & { options: OptimizeOptions }) {
  const nav = useNavigation();
  const active = useScreenActive();
  const [items, setItems] = useState<ProgressItem[]>(() =>
    files.map((path) => ({ id: path, label: displayPath(path, ctx.cwd), status: "pending" })),
  );
  const [report, setReport] = useState<OptimizeReport>();

  useEffect(() => {
    const controller = new AbortController();
    optimizeImages({ files: toImageFiles(files, ctx.cwd), missing: [], ignored: [] }, options, {
      signal: controller.signal,
      onProgress: (event) => setItems((current) => applyProgress(current, event)),
    }).then((result) => {
      if (!options.dryRun && result.totals.converted > 0) onWritten();
      if (!controller.signal.aborted) setReport(result);
    });
    return () => controller.abort();
  }, [files, ctx.cwd, options, onWritten]);

  useInput(
    (_input, key) => {
      if (key.return && report) nav.popTo(rootId);
    },
    { isActive: active },
  );

  return (
    <Screen
      subtitle={`${options.dryRun ? "Dry run · " : ""}${describeOptions(options)}`}
      hints={report ? [{ key: "enter", label: "pick more images" }] : [{ key: "esc", label: "cancel" }]}
    >
      {report ? <Results report={report} cwd={ctx.cwd} /> : <ProgressList items={items} />}
    </Screen>
  );
}

function Results({ report, cwd }: { report: OptimizeReport; cwd: string }) {
  const { totals } = report;
  const title = report.options.dryRun ? "Dry run finished" : "Done";
  const saved =
    totals.converted > 0
      ? ` · saved ${formatBytes(totals.savedBytes)} (${totals.savedPercent.toFixed(1)}%)`
      : "";
  const counts = `${totals.converted} converted · ${totals.skipped} skipped · ${totals.failed} failed`;

  return (
    <Box flexDirection="column" rowGap={1}>
      <StatusBar
        tone={totals.failed > 0 ? "warning" : "success"}
        message={`${title} · ${counts}${saved} · ${formatDuration(report.durationMs)}`}
      />
      <ResultTable
        columns={[
          { key: "status", label: " ", color: (row) => colors[row.statusTone] },
          { key: "file" },
          { key: "size", align: "right" },
          { key: "change", align: "right", color: (row) => colors[row.changeTone] },
          { key: "note", color: () => colors.muted },
        ]}
        rows={report.files.map((file) => fileRow(file, cwd))}
        limit={15}
      />
      {report.options.dryRun ? <Text color={colors.muted}>Nothing was written.</Text> : null}
    </Box>
  );
}

export function runScreen(props: StepProps, options: OptimizeOptions): ScreenEntry {
  return { id: "image:run", title: "Optimize", render: () => <RunStep {...props} options={options} /> };
}
