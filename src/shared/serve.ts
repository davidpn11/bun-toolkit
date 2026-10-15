import { type FSWatcher, realpathSync, watch } from "node:fs";
import { isIP } from "node:net";
import { hostname as machineName } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { Server } from "bun";
import type { BtkContext } from "../context.ts";
import { BtkError } from "../errors.ts";

export const EVENTS_PATH = "/__btk/events";
export const LOOPBACK = "127.0.0.1";

export type WatchTarget = {
  dir: string;
  recursive: boolean;
  accept: (changed: string) => boolean;
};

export type LiveServerOptions = {
  root: string;
  watch: WatchTarget | undefined;
  /** Interface to listen on; anything but loopback exposes the server to the network. */
  hostname?: string;
  port: number;
  /** The response for a page, or undefined to serve `pathname` as a file under `root`. */
  page: (pathname: string) => Promise<Response | undefined>;
  headers?: Record<string, string>;
  /** Called when file watching can't start or stops working; the server keeps serving without reloads. */
  onWatchError?: (error: unknown) => void;
  onRequest?: (request: ServedRequest) => void;
  signal: AbortSignal;
};

export type ServedRequest = { method: string; path: string; status: number };

export type LiveServer = {
  url: string;
  port: number;
  closed: Promise<void>;
};

type Clients = Set<ReadableStreamDefaultController<string>>;

const LOOPBACK_NAMES = new Set([LOOPBACK, "localhost", "::1", "[::1]"]);
const RELOAD_DEBOUNCE_MS = 50;
const KEEPALIVE_MS = 15_000;
const IGNORED = /(^|[\\/])(node_modules|\.[^\\/]+)([\\/]|$)/;

export function startLiveServer(options: LiveServerOptions): LiveServer {
  const clients: Clients = new Set();
  const hostname = options.hostname ?? LOOPBACK;
  const server = Bun.serve({
    hostname,
    port: options.port,
    fetch: (request, srv) => route(request, srv, options, clients),
  });
  const reload = () => broadcast(clients, "reload");
  const watcher = options.watch && startWatching(options.watch, reload, options.onWatchError);
  const keepalive = setInterval(() => broadcast(clients, "ping"), KEEPALIVE_MS);
  const port = server.port as number;
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
  return { url: `http://${browserHost(hostname)}:${port}/`, port, closed };
}

export async function serveUntilStopped(
  options: Omit<LiveServerOptions, "signal">,
  open: boolean,
  ctx: BtkContext,
  announce: (server: LiveServer, link: string) => void,
  /** Page to announce and open, relative to the server root. */
  page = "",
): Promise<LiveServer> {
  const server = listen(options, ctx);
  const url = new URL(page, server.url).href;
  announce(server, ctx.reporter.style.accent(url));
  if (open && !openBrowser(ctx.platform, url)) {
    ctx.reporter.log.warn("Could not open a browser; open the URL yourself");
  }
  await server.closed;
  return server;
}

function warnNoReload(error: unknown, ctx: BtkContext): void {
  const reason = error instanceof Error ? error.message : String(error);
  ctx.reporter.log.warn(`Can't watch for changes (${reason}); reload the page yourself`);
}

function listen(options: Omit<LiveServerOptions, "signal">, ctx: BtkContext): LiveServer {
  try {
    return startLiveServer({
      onWatchError: (error) => warnNoReload(error, ctx),
      ...options,
      signal: ctx.signal,
    });
  } catch (error) {
    throw new BtkError(`Could not start the server on port ${options.port}`, {
      code: "ERR_SERVER",
      hint: "Another program may be using the port; --port 0 picks a free one",
      cause: error,
    });
  }
}

export function isLoopback(hostname: string): boolean {
  return LOOPBACK_NAMES.has(hostname);
}

export function isIgnoredPath(path: string): boolean {
  return IGNORED.test(path);
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** Undefined for malformed URLs, paths outside `root`, and dotfiles such as `.env`. */
export function pathInside(root: string, pathname: string): string | undefined {
  const decoded = safeDecode(pathname);
  if (decoded === undefined || decoded.split(/[\\/]/).some((segment) => segment.startsWith(".")))
    return undefined;
  const path = resolve(root, `.${decoded}`);
  return isInside(root, path) && linksStayInside(root, path) ? path : undefined;
}

function isInside(root: string, path: string): boolean {
  const inside = relative(root, path);
  return !inside.startsWith("..") && !isAbsolute(inside);
}

/** A symlink inside the folder must not lead out of it. Missing paths pass; callers check that they exist. */
function linksStayInside(root: string, path: string): boolean {
  const real = safeRealpath(path);
  return real === undefined || isInside(safeRealpath(root) ?? root, real);
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

export function watchOneFile(dir: string, file: string): WatchTarget {
  const name = basename(file);
  return { dir, recursive: false, accept: (changed) => basename(changed) === name };
}

/**
 * Which `Host` headers to answer. Loopback servers only answer loopback names, and exposed servers also
 * answer IP addresses and this machine's name. Other names are refused to block DNS rebinding.
 */
export function isAllowedHost(host: string, serverHostname: string): boolean {
  if (isLoopback(host)) return true;
  if (isLoopback(serverHostname)) return false;
  const name = host.toLowerCase();
  const machine = machineName().toLowerCase();
  return isIP(name.replace(/^\[|\]$/g, "")) !== 0 || name === machine || name === `${machine}.local`;
}

async function route(
  request: Request,
  server: Server<undefined>,
  options: LiveServerOptions,
  clients: Clients,
): Promise<Response> {
  const { pathname, hostname } = new URL(request.url);
  if (!isAllowedHost(hostname, options.hostname ?? LOOPBACK))
    return new Response("Forbidden", { status: 403 });
  if (pathname === EVENTS_PATH) {
    server.timeout(request, 0);
    return eventStream(clients);
  }
  const response = withHeaders(await respond(options, pathname), options.headers);
  options.onRequest?.({ method: request.method, path: pathname, status: response.status });
  return response;
}

async function respond(options: LiveServerOptions, pathname: string): Promise<Response> {
  try {
    return (await options.page(pathname)) ?? (await serveAsset(options.root, pathname));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Could not render the page: ${message}`, { status: 500 });
  }
}

function withHeaders(response: Response, headers: Record<string, string> | undefined): Response {
  for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
  return response;
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

async function serveAsset(root: string, pathname: string): Promise<Response> {
  const path = pathInside(root, pathname);
  const file = path ? Bun.file(path) : undefined;
  return file && (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
}

function safeDecode(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

/** Watches a folder rather than single files, so editors that save by replacing the file still trigger a reload. */
function startWatching(
  target: WatchTarget,
  onChange: () => void,
  onError: ((error: unknown) => void) | undefined,
): FSWatcher | undefined {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const watcher = watch(target.dir, { recursive: target.recursive }, (_event, changed) => {
      if (changed && !target.accept(changed.toString())) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, RELOAD_DEBOUNCE_MS);
    });
    watcher.on("error", (error) => {
      watcher.close();
      onError?.(error);
    });
    return watcher;
  } catch (error) {
    onError?.(error);
    return undefined;
  }
}

/** Wildcard addresses can't be opened in a browser; `localhost` reaches them. */
function browserHost(hostname: string): string {
  if (hostname === "0.0.0.0" || hostname === "::") return "localhost";
  return hostname.includes(":") ? `[${hostname}]` : hostname;
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
