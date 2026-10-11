import type { BtkContext } from "../../../context.ts";
import { pluralize } from "../../../output/format.ts";
import {
  Screen,
  type ScreenEntry,
  type SelectItem,
  SelectList,
  useNavigation,
  useTerminalSize,
} from "../../../tui/index.ts";
import { ALGORITHMS, type Algorithm, algorithmInfo } from "../algorithms.ts";
import { hashSettings } from "../tool.ts";
import { resultsScreen } from "./ResultsStep.tsx";

export type StepProps = { files: string[]; ctx: BtkContext };

function items(preferred: Algorithm): SelectItem<Algorithm>[] {
  return ALGORITHMS.map((name) => {
    const info = algorithmInfo(name);
    return {
      value: name,
      label: name,
      description: `${info.bits} bits`,
      section: info.kind === "cryptographic" ? "Cryptographic" : "Fast (not for security)",
      ...(name === preferred && { tag: "default" }),
    };
  });
}

function AlgorithmStep({ files, ctx }: StepProps) {
  const nav = useNavigation();
  const { rows } = useTerminalSize();
  const preferred = hashSettings(ctx).algorithm;
  return (
    <Screen
      subtitle={`${pluralize(files.length, "file")} selected · pick an algorithm`}
      hints={[
        { key: "↑↓", label: "move" },
        { key: "enter", label: "hash" },
      ]}
    >
      <SelectList
        items={items(preferred)}
        initialIndex={ALGORITHMS.indexOf(preferred)}
        limit={Math.max(5, rows - 12)}
        onSelect={(item) => nav.push(resultsScreen({ files, ctx }, item.value))}
      />
    </Screen>
  );
}

export function algorithmScreen(props: StepProps): ScreenEntry {
  return { id: "hash:algorithm", title: "Algorithm", render: () => <AlgorithmStep {...props} /> };
}
