import { Text } from "ink";
import { useEffect, useState } from "react";
import type { ToolDef, ToolScreen } from "../../cli/define.ts";
import { colors, icons } from "../../output/palette.ts";
import { Screen } from "../components/Screen.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { useBtk } from "../context.tsx";
import type { ScreenEntry } from "../navigation.tsx";

export function ToolHost({ tool }: { tool: ToolDef }) {
  const ctx = useBtk();
  const [state, setState] = useState<{ Component?: ToolScreen; error?: string }>({});

  useEffect(() => {
    let alive = true;
    if (!tool.ui) {
      setState({ error: `${tool.name} has no dashboard` });
      return;
    }
    tool.ui().then(
      (mod) => alive && setState({ Component: mod.default }),
      (error: unknown) =>
        alive && setState({ error: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, [tool]);

  if (state.Component) return <state.Component ctx={ctx} tool={tool} />;
  return (
    <Screen subtitle={tool.description}>
      {state.error ? (
        <Text color={colors.error}>
          {icons.error} Could not open the {tool.name} dashboard: {state.error}
        </Text>
      ) : (
        <Spinner label={`Loading ${tool.name}…`} />
      )}
    </Screen>
  );
}

export function toolScreen(tool: ToolDef): ScreenEntry {
  return { id: `tool:${tool.name}`, title: tool.name, render: () => <ToolHost tool={tool} /> };
}
