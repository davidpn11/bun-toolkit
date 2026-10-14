import { type FSWatcher, watch } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { Server } from "bun";

export const EVENTS_PATH = "/__btk/events";

export type PreviewOptions = {
  /** The markdown file, or undefined for standard input (no reloads, assets from `root`). */
  file: string | undefined;
  root: string;
  port: number;
  render: () => Promise<string>;
  signal: AbortSignal;
};

export type PreviewServer = {
  url: string;
  /** Settles when the signal aborts and the server has stopped. */
  closed: Promise<void>;
};

type Clients = Set<ReadableStreamDefaultController<string>>;

const RELOAD_DEBOUNCE_MS = 50;
const KEEPALIVE_MS = 15_000;

export function startPreview(options: PreviewOptions): PreviewServer {
  const clients: Clients = new Set();
  const root = options.file ? dirname(options.file) : options.root;
  const watcher = options.file ? watchFile(options.file, () => broadcast(clients, "reload")) : undefined;
  let server: Server<undefined>;
  try {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: options.port,
      fetch: (request, srv) => route(request, srv, { ...options, root }, clients),
    });
  } catch (error) {
    watcher?.close();
    throw error;
  }
  const keepalive = setInterval(() => broadcast(clients, "ping"), KEEPALIVE_MS);
  const closed = new Promise<void>((done) => {
    const stop = () => {
      clearInterval(keepalive);
      watcher?.close();
      for (const client of clients) closeClient(client);
      void server.stop(true).then(done);
    };
    if (options.signal.aborted) stop();
    else options.signal.addEventListener("abort", stop, { once: true });
  });
  return { url: `http://127.0.0.1:${server.port}/`, closed };
}

async function route(
  request: Request,
  server: Server<undefined>,
  options: PreviewOptions,
  clients: Clients,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/") return renderPage(options);
  if (pathname === EVENTS_PATH) {
    server.timeout(request, 0);
    return eventStream(clients);
  }
  return serveAsset(options.root, pathname);
}

async function renderPage(options: PreviewOptions): Promise<Response> {
  try {
    return new Response(await options.render(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Could not render the preview: ${message}`, { status: 500 });
  }
}

function eventStream(clients: Clients): Response {
  let controller: ReadableStreamDefaultController<string> | undefined;
  const stream = new ReadableStream<string>({
    start(c) {
      controller = c;
      clients.add(c);
      c.enqueue(": connected\n\n");
    },
    cancel() {
      if (controller) clients.delete(controller);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

function closeClient(client: ReadableStreamDefaultController<string>): void {
  try {
    client.close();
  } catch {
    // The browser already disconnected.
  }
}

function broadcast(clients: Clients, event: string): void {
  for (const client of clients) {
    try {
      client.enqueue(`event: ${event}\ndata: \n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

/** Images and other files the markdown links to, from its own folder only. */
async function serveAsset(root: string, pathname: string): Promise<Response> {
  const decoded = safeDecode(pathname);
  if (decoded === undefined) return new Response("Not found", { status: 404 });
  const path = resolve(root, `.${decoded}`);
  const inside = relative(root, path);
  if (inside.startsWith("..") || isAbsolute(inside)) return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
}

function safeDecode(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/** Watches the folder, not the file, so editors that save by replacing the file still trigger a reload. */
function watchFile(file: string, onChange: () => void): FSWatcher {
  const name = basename(file);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return watch(dirname(file), (_event, changed) => {
    if (changed && basename(changed.toString()) !== name) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DEBOUNCE_MS);
  });
}

export function openCommand(platform: NodeJS.Platform, url: string): string[] {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}

export function openBrowser(platform: NodeJS.Platform, url: string): boolean {
  try {
    Bun.spawn(openCommand(platform, url), { stdio: ["ignore", "ignore", "ignore"] }).unref();
    return true;
  } catch {
    return false;
  }
}
