import { resolve } from "node:path";
import { Text } from "ink";
import { useMemo } from "react";
import type { BtkContext } from "../../../context.ts";
import { formatBytes, pluralize } from "../../../output/format.ts";
import { colors } from "../../../output/palette.ts";
import {
  fieldsFromArgs,
  initialValues,
  OPTIONS_FORM_HINTS,
  OptionsForm,
  Screen,
  type ScreenEntry,
  useNavigation,
} from "../../../tui/index.ts";
import type { CompressPlan } from "../compress.ts";
import type { Format } from "../formats.ts";
import { compressRun, compressSettings } from "../tool.ts";
import { compressRunScreen } from "./RunStep.tsx";

export type StepProps = { files: string[]; ctx: BtkContext; rootId: string; onWritten: () => void };

const FIELDS = fieldsFromArgs(compressRun.args ?? {}, {
  exclude: ["gzip", "zstd", "brotli", "deflate", "output", "each", "recursive"],
});

function OptionsStep({ files, ctx, rootId, onWritten }: StepProps) {
  const nav = useNavigation();
  const total = useMemo(() => files.reduce((sum, path) => sum + Bun.file(path).size, 0), [files]);
  const initial = initialValues(compressRun.args ?? {}, compressSettings(ctx));

  const run = (values: Record<string, unknown>) => {
    const plan: CompressPlan = {
      formats: [values.format as Format],
      level: values.level as number | undefined,
      outDir: values.outDir ? resolve(ctx.cwd, values.outDir as string) : undefined,
      overwrite: values.overwrite as boolean,
      dryRun: values.dryRun as boolean,
      each: false,
      recursive: false,
    };
    nav.push(compressRunScreen({ files, ctx, rootId, onWritten }, plan));
  };

  return (
    <Screen
      subtitle={`${pluralize(files.length, "file")} selected · ${formatBytes(total)}`}
      hints={OPTIONS_FORM_HINTS}
    >
      <OptionsForm fields={FIELDS} initial={initial} onSubmit={run} submitLabel="Compress" />
      <Text color={colors.muted}>Leave the level empty to use the format's default. Originals are kept.</Text>
    </Screen>
  );
}

export function optionsScreen(props: StepProps): ScreenEntry {
  return { id: "compress:options", title: "Options", render: () => <OptionsStep {...props} /> };
}
