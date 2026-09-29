import { Text } from "ink";
import type { ToolScreenProps } from "../../src/cli/define.ts";
import { Screen } from "../../src/tui/index.ts";

export default function FakeScreen({ ctx, tool }: ToolScreenProps) {
  const level = ctx.config.tools[tool.name]?.level;
  return (
    <Screen subtitle={tool.description}>
      <Text>demo dashboard · level {String(level)}</Text>
    </Screen>
  );
}
