import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { Box, useInput } from "ink";
import { useMemo, useState } from "react";
import { displayPath } from "../../../config/loader.ts";
import type { BtkContext } from "../../../context.ts";
import {
  Screen,
  type ScreenEntry,
  StatusBar,
  TEXT_VIEWER_HINTS,
  TextViewer,
  type Tone,
  useScreenActive,
  useTerminalSize,
} from "../../../tui/index.ts";
import { type Converted, convertFiles, convertText } from "../convert.ts";
import type { OutputFormat } from "../formats.ts";
import { convertSettings } from "../tool.ts";
import type { StepProps } from "./FormatStep.tsx";

type Preview = { converted?: Converted; error?: string };

function usePreview(file: string, to: OutputFormat, ctx: BtkContext): Preview {
  return useMemo(() => {
    try {
      const text = readFileSync(file, "utf8");
      return { converted: convertText(text, { ...convertSettings(ctx), from: undefined, to }, file) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [file, to, ctx]);
}

function PreviewStep({ file, ctx, onWritten, to }: StepProps & { to: OutputFormat }) {
  const active = useScreenActive();
  const { rows } = useTerminalSize();
  const preview = usePreview(file, to, ctx);
  const [status, setStatus] = useState<{ tone: Tone; message: string }>();

  const write = async () => {
    const settings = convertSettings(ctx);
    const collected = { files: [{ path: file, base: dirname(file) }], missing: [], ignored: [] };
    const report = await convertFiles(
      collected,
      { ...settings, from: undefined, to },
      { overwrite: settings.overwrite, dryRun: false },
    );
    const [result] = report.files;
    if (result?.status === "converted" && result.output) {
      setStatus({ tone: "success", message: `Wrote ${displayPath(result.output, ctx.cwd)}` });
      onWritten();
    } else {
      setStatus({ tone: "warning", message: [result?.reason, result?.hint].filter(Boolean).join(". ") });
    }
  };

  useInput(
    (input) => {
      if (input === "w" && preview.converted) void write();
    },
    { isActive: active },
  );

  const from = preview.converted?.from ?? "?";
  return (
    <Screen
      subtitle={`${basename(file)} · ${from} → ${to}`}
      hints={preview.converted ? [...TEXT_VIEWER_HINTS, { key: "w", label: "write file" }] : []}
    >
      <Box flexDirection="column" rowGap={1}>
        {status ? <StatusBar tone={status.tone} message={status.message} /> : null}
        {preview.error ? <StatusBar tone="error" message={preview.error} /> : null}
        {preview.converted ? (
          <TextViewer text={preview.converted.output} height={Math.max(5, rows - 14)} />
        ) : null}
      </Box>
    </Screen>
  );
}

export function previewScreen(props: StepProps, to: OutputFormat): ScreenEntry {
  return { id: "convert:preview", title: "Preview", render: () => <PreviewStep {...props} to={to} /> };
}
