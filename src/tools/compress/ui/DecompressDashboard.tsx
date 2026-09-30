import type { ToolScreenProps } from "../../../cli/define.ts";
import { DecompressBrowser } from "./BrowseStep.tsx";

export default function DecompressDashboard({ ctx, tool }: ToolScreenProps) {
  return <DecompressBrowser ctx={ctx} rootId={`tool:${tool.name}`} />;
}
