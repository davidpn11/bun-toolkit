import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type { ToolScreenProps } from "../../../cli/define.ts";
import { isLoopback, openBrowser, type ServedRequest, startLiveServer } from "../../../shared/serve.ts";
import { colors, Screen, StatusBar, useScreenActive } from "../../../tui/index.ts";
import type { ServeConfig } from "../config.ts";
import { networkUrls } from "../network.ts";
import { folderServer } from "../server.ts";
import { serveSettings } from "../tool.ts";

type ServerState =
  | { kind: "starting" }
  | { kind: "running"; url: string; network: string[] }
  | { kind: "failed"; message: string };

const SHOWN_REQUESTS = 8;

export default function ServeDashboard({ ctx }: ToolScreenProps) {
  const active = useScreenActive();
  const settings = serveSettings(ctx);
  const { state, requests, warning } = useFolderServer(ctx.cwd, settings, ctx.platform);

  useInput(
    (input) => {
      if (input === "o" && state.kind === "running") openBrowser(ctx.platform, state.url);
    },
    { isActive: active },
  );

  return (
    <Screen
      subtitle={`Serving ${ctx.cwd}`}
      hints={state.kind === "running" ? [{ key: "o", label: "open in browser" }] : []}
    >
      <Box flexDirection="column" rowGap={1}>
        <ServerStatus state={state} settings={settings} />
        {warning ? <StatusBar tone="warning" message={warning} /> : null}
        {state.kind === "running" ? <RequestLog requests={requests} /> : null}
      </Box>
    </Screen>
  );
}

function useFolderServer(root: string, settings: ServeConfig, platform: NodeJS.Platform) {
  const [state, setState] = useState<ServerState>({ kind: "starting" });
  const [requests, setRequests] = useState<ServedRequest[]>([]);
  const [warning, setWarning] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    try {
      const server = startLiveServer({
        ...folderServer(root, settings),
        signal: controller.signal,
        onRequest: (request) => setRequests((list) => [request, ...list].slice(0, SHOWN_REQUESTS)),
        onWatchError: () => setWarning("Can't watch for changes here, so pages won't reload on their own"),
      });
      setState({ kind: "running", url: server.url, network: networkUrls(settings.host, server.port) });
      if (settings.open) openBrowser(platform, server.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setState({ kind: "failed", message: `Could not start the server on port ${settings.port}: ${reason}` });
    }
    return () => controller.abort();
  }, [root, settings, platform]);

  return { state, requests, warning };
}

function ServerStatus({ state, settings }: { state: ServerState; settings: ServeConfig }) {
  if (state.kind === "starting") return <StatusBar tone="info" message="Starting the server…" />;
  if (state.kind === "failed") {
    return (
      <Box flexDirection="column">
        <StatusBar tone="error" message={state.message} />
        <Text color={colors.muted}>
          Another program may be using the port; set tools.serve.port to 0 for a free one.
        </Text>
      </Box>
    );
  }
  const options = [`port ${new URL(state.url).port}`, settings.spa ? "spa" : "", settings.cors ? "cors" : ""];
  return (
    <Box flexDirection="column">
      <StatusBar tone="success" message={`Running at ${state.url}`} />
      {isLoopback(settings.host) ? null : (
        <Box flexDirection="column">
          <StatusBar tone="warning" message="Anyone on your network can open these files" />
          {state.network.map((url) => (
            <Text key={url}> {url}</Text>
          ))}
        </Box>
      )}
      <Text color={colors.muted}>
        {[...options.filter(Boolean), "reloads pages when files change"].join(" · ")}. Leave this screen to
        stop it.
      </Text>
    </Box>
  );
}

function RequestLog({ requests }: { requests: ServedRequest[] }) {
  return (
    <Box flexDirection="column">
      <Text color={colors.muted} bold>
        Requests
      </Text>
      {requests.length === 0 ? <Text color={colors.muted}>None yet</Text> : null}
      {requests.map((request, i) => (
        <Text key={`${i}-${request.path}`}>
          <Text color={statusColor(request.status)}>{request.status}</Text> {request.method} {request.path}
        </Text>
      ))}
    </Box>
  );
}

function statusColor(status: number): string {
  if (status >= 500) return colors.error;
  if (status >= 400) return colors.warning;
  if (status >= 300) return colors.muted;
  return colors.success;
}
