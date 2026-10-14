import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, symlinkSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { createTempProject, type TempProject } from "../../tests/support/tmp.ts";
import { BtkError, UsageError } from "../errors.ts";
import { displayPath, requireFolder } from "./fs.ts";
import {
  EVENTS_PATH,
  htmlResponse,
  isAllowedHost,
  isIgnoredPath,
  openCommand,
  pathInside,
  startLiveServer,
  watchOneFile,
} from "./serve.ts";

describe("startLiveServer", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  test("serves the page, files next to it, and reload events when the file changes", async () => {
    project = createTempProject();
    const file = project.write("doc.md", "# One");
    project.write("logo.svg", "<svg/>");
    const stop = new AbortController();
    const server = startLiveServer({
      root: project.dir,
      watch: watchOneFile(project.dir, file),
      port: 0,
      page: async (pathname) => (pathname === "/" ? htmlResponse(await Bun.file(file).text()) : undefined),
      signal: stop.signal,
    });

    expect(await (await fetch(server.url)).text()).toBe("# One");
    expect(await (await fetch(`${server.url}logo.svg`)).text()).toBe("<svg/>");
    expect((await fetch(`${server.url}%2e%2e/secret`)).status).toBe(404);
    project.write(".env", "SECRET=1");
    expect((await fetch(`${server.url}.env`)).status).toBe(404);
    expect((await fetch(server.url, { headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await fetch(`${server.url}missing.png`)).status).toBe(404);

    const events = await fetch(new URL(EVENTS_PATH, server.url));
    const reader = (events.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    appendFileSync(join(project.dir, "doc.md"), "\nmore");
    expect(await readUntil(reader, "event: reload")).toBe(true);

    await reader.cancel();
    stop.abort();
    await server.closed;
  });

  test("a recursive watch reloads when a nested page changes", async () => {
    project = createTempProject();
    project.write("docs/deep/page.md", "# Deep");
    const stop = new AbortController();
    const server = startLiveServer({
      root: project.dir,
      watch: { dir: project.dir, recursive: true, accept: (changed) => changed.endsWith(".md") },
      port: 0,
      page: async () => undefined,
      signal: stop.signal,
    });
    const reader = (
      (await fetch(new URL(EVENTS_PATH, server.url))).body as ReadableStream<Uint8Array>
    ).getReader();
    await reader.read();
    appendFileSync(join(project.dir, "docs/deep/page.md"), "\nmore");
    expect(await readUntil(reader, "event: reload")).toBe(true);
    await reader.cancel();
    stop.abort();
    await server.closed;
  });

  test("adds the configured headers to every response", async () => {
    project = createTempProject();
    const stop = new AbortController();
    const server = startLiveServer({
      root: project.dir,
      watch: undefined,
      port: 0,
      page: async (pathname) => (pathname === "/" ? htmlResponse("ok") : undefined),
      headers: { "Access-Control-Allow-Origin": "*" },
      signal: stop.signal,
    });
    expect((await fetch(server.url)).headers.get("access-control-allow-origin")).toBe("*");
    expect((await fetch(`${server.url}missing`)).headers.get("access-control-allow-origin")).toBe("*");
    stop.abort();
    await server.closed;
  });

  test("opens the browser with each platform's command", () => {
    expect(openCommand("darwin", "u")).toEqual(["open", "u"]);
    expect(openCommand("win32", "u")).toEqual(["cmd", "/c", "start", "", "u"]);
    expect(openCommand("linux", "u")).toEqual(["xdg-open", "u"]);
  });
});

async function readUntil(
  reader: { read(): Promise<{ value?: Uint8Array; done: boolean }> },
  text: string,
): Promise<boolean> {
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes(text)) {
    const { value, done } = await reader.read();
    if (done) return false;
    seen += decoder.decode(value);
  }
  return true;
}

describe("server helpers", () => {
  test("loopback servers only answer loopback names; exposed ones also answer IPs and this machine", () => {
    expect(isAllowedHost("localhost", "127.0.0.1")).toBe(true);
    expect(isAllowedHost("192.168.1.4", "127.0.0.1")).toBe(false);
    expect(isAllowedHost("192.168.1.4", "0.0.0.0")).toBe(true);
    expect(isAllowedHost("[fe80::1]", "::")).toBe(true);
    expect(isAllowedHost(hostname(), "0.0.0.0")).toBe(true);
    expect(isAllowedHost("evil.example", "0.0.0.0")).toBe(false);
  });

  test("paths stay inside the root and never reach dotfiles", () => {
    expect(pathInside("/srv", "/a/b.txt")).toBe(resolve("/srv", "a/b.txt"));
    expect(pathInside("/srv", "/x\\.env")).toBeUndefined();
    expect(pathInside("/srv", "/%2e%2e/etc/passwd")).toBeUndefined();
    expect(pathInside("/srv", "/.git/config")).toBeUndefined();
    expect(pathInside("/srv", "/%E0%A4%A")).toBeUndefined();
  });

  test("node_modules and dot folders are ignored by watchers", () => {
    expect(isIgnoredPath("node_modules/x/index.js")).toBe(true);
    expect(isIgnoredPath("src\\.cache\\a")).toBe(true);
    expect(isIgnoredPath("docs/guide.md")).toBe(false);
  });
});

describe("symlinks and watching", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  test.skipIf(process.platform === "win32")("a symlink that leads out of the folder is refused", () => {
    project = createTempProject();
    const outside = project.writeGlobal("secret", "secret.txt");
    mkdirSync(join(project.dir, "site/real"), { recursive: true });
    symlinkSync(outside, join(project.dir, "site/escape.txt"));
    symlinkSync(join(project.dir, "site/real"), join(project.dir, "site/inner"));
    const root = join(project.dir, "site");
    expect(pathInside(root, "/escape.txt")).toBeUndefined();
    expect(pathInside(root, "/inner")).toBe(join(root, "inner"));
  });

  test("a folder that can't be watched still serves, and reports why", async () => {
    project = createTempProject();
    const errors: unknown[] = [];
    const stop = new AbortController();
    const server = startLiveServer({
      root: project.dir,
      watch: { dir: join(project.dir, "missing"), recursive: true, accept: () => true },
      port: 0,
      page: async () => htmlResponse("still here"),
      onWatchError: (error) => errors.push(error),
      signal: stop.signal,
    });
    expect(await (await fetch(server.url)).text()).toBe("still here");
    expect(errors).toHaveLength(1);
    stop.abort();
    await server.closed;
  });
});

describe("folder arguments", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  test("requireFolder accepts folders, fails on missing paths, and rejects files with a hint", () => {
    project = createTempProject();
    project.write("site/index.html", "");
    expect(requireFolder("site", project.dir, "hint")).toBe(join(project.dir, "site"));
    expect(() => requireFolder("nope", project.dir, "hint")).toThrow(BtkError);
    expect(() => requireFolder("site/index.html", project.dir, "use a file")).toThrow(UsageError);
  });

  test("displayPath is relative inside the working directory and absolute outside it", () => {
    expect(displayPath("/work/docs", "/work")).toBe("docs");
    expect(displayPath("/work", "/work")).toBe(".");
    expect(displayPath("/elsewhere/site", "/work")).toBe("/elsewhere/site");
  });
});
