import type { ToolScreenProps } from "../../../cli/define.ts";
import { Screen, type ScreenEntry, type SelectItem, SelectList, useNavigation } from "../../../tui/index.ts";
import { compressBrowser, decompressBrowser } from "./BrowseStep.tsx";

export default function CompressDashboard({ ctx }: ToolScreenProps) {
  const nav = useNavigation();
  const items: SelectItem<ScreenEntry>[] = [
    {
      value: compressBrowser(ctx),
      label: "Compress files",
      description: "gzip, zstd, brotli or deflate, next to the originals",
    },
    {
      value: decompressBrowser(ctx, "decompress:browse"),
      label: "Decompress files",
      description: ".gz, .zst, .br, .deflate, and .tar archives",
    },
  ];
  return (
    <Screen subtitle="Compress and decompress files" hints={[{ key: "enter", label: "open" }]}>
      <SelectList items={items} onSelect={(item) => nav.push(item.value)} />
    </Screen>
  );
}
