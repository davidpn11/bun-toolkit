import { basename } from "node:path";
import type { BtkContext } from "../../../context.ts";
import { Screen, type ScreenEntry, type SelectItem, SelectList, useNavigation } from "../../../tui/index.ts";
import { extensionFor, formatFromPath, OUTPUT_FORMATS, type OutputFormat } from "../formats.ts";
import { convertSettings } from "../tool.ts";
import { previewScreen } from "./PreviewStep.tsx";

export type StepProps = { file: string; ctx: BtkContext; onWritten: () => void };

function FormatStep({ file, ctx, onWritten }: StepProps) {
  const nav = useNavigation();
  const from = formatFromPath(file);
  const preferred = convertSettings(ctx).to;
  const items: SelectItem<OutputFormat>[] = OUTPUT_FORMATS.map((format) => ({
    value: format,
    label: format,
    description: extensionFor(format),
    ...(format === from && { tag: "same format" }),
    ...(format === preferred && format !== from && { tag: "default" }),
  }));
  return (
    <Screen
      subtitle={`${basename(file)}${from ? ` · ${from}` : ""} · convert to`}
      hints={[
        { key: "↑↓", label: "move" },
        { key: "enter", label: "preview" },
      ]}
    >
      <SelectList
        items={items}
        initialIndex={Math.max(0, OUTPUT_FORMATS.indexOf(preferred))}
        onSelect={(item) => nav.push(previewScreen({ file, ctx, onWritten }, item.value))}
      />
    </Screen>
  );
}

export function formatScreen(props: StepProps): ScreenEntry {
  return { id: "convert:format", title: "Format", render: () => <FormatStep {...props} /> };
}
