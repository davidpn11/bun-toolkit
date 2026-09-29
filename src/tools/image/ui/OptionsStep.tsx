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
import { buildOptions } from "../options.ts";
import { imageSettings, optimize } from "../tool.ts";
import { runScreen } from "./RunStep.tsx";

export type StepProps = {
  files: string[];
  ctx: BtkContext;
  /** Screen id of the dashboard, to return to after a run. */
  rootId: string;
  onWritten: () => void;
};

const FIELDS = fieldsFromArgs(optimize.args ?? {}, { exclude: ["preset", "recursive"] });

function OptionsStep({ files, ctx, rootId, onWritten }: StepProps) {
  const nav = useNavigation();
  const total = useMemo(() => files.reduce((sum, path) => sum + Bun.file(path).size, 0), [files]);
  const initial = initialValues(optimize.args ?? {}, imageSettings(ctx));

  const run = (values: Record<string, unknown>) => {
    const options = buildOptions(values as Parameters<typeof buildOptions>[0], ctx.cwd);
    nav.push(runScreen({ files, ctx, rootId, onWritten }, options));
  };

  return (
    <Screen
      subtitle={`${pluralize(files.length, "image")} selected · ${formatBytes(total)}`}
      hints={OPTIONS_FORM_HINTS}
    >
      <OptionsForm fields={FIELDS} initial={initial} onSubmit={run} submitLabel="Optimize" />
      <Text color={colors.muted}>Defaults come from your btk config. Press esc to change the selection.</Text>
    </Screen>
  );
}

export function optionsScreen(props: StepProps): ScreenEntry {
  return { id: "image:options", title: "Options", render: () => <OptionsStep {...props} /> };
}
