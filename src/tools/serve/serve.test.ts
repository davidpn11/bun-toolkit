import { afterEach, describe, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { networkUrls } from "./network.ts";
import { injectReload, listingPage, notFoundPage } from "./pages.ts";
import { resolveRequest } from "./resolve.ts";
import { respond } from "./server.ts";

describe("btk serve", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const site = () => {
    project = createTempProject();
    project.write("index.html", "<html><body><h1>Home</h1></body></html>");
    project.write("app.css", "h1 { color: red; }");
    project.write("docs/guide.html", "<p>guide</p>");
    project.write("docs/z.txt", "12345");
    project.write("docs/a-folder/x.txt", "");
    project.write("docs/.secret", "");
    project.write("assets/logo.svg", "<svg/>");
    return project.dir;
  };

  test("resolves files, folder indexes, listings, redirects and missing paths", () => {
    const root = site();
    expect(resolveRequest(root, "/", false)).toEqual({ kind: "file", path: join(root, "index.html") });
    expect(resolveRequest(root, "/app.css", false)).toEqual({ kind: "file", path: join(root, "app.css") });
    expect(resolveRequest(root, "/docs", false)).toEqual({ kind: "redirect", location: "/docs/" });
    expect(resolveRequest(root, "/docs/", false)).toEqual({ kind: "listing", path: join(root, "docs") });
    expect(resolveRequest(root, "/nope", false)).toEqual({ kind: "missing" });
    expect(resolveRequest(root, "/docs/.secret", false)).toEqual({ kind: "missing" });
  });

  test("index symlinks and links to dotfiles can't escape the root, and redirects stay on the server", () => {
    const root = site();
    const outside = project.write("../outside.html", "secret");
    symlinkSync(outside, join(root, "docs/index.html"));
    symlinkSync(join(root, "docs/.secret"), join(root, "visible.txt"));
    expect(resolveRequest(root, "/docs/", false)).toEqual({ kind: "listing", path: join(root, "docs") });
    expect(resolveRequest(root, "/visible.txt", false)).toEqual({ kind: "missing" });
    project.write("evil.com/x.txt", "");
    expect(resolveRequest(root, "//evil.com", false)).toEqual({ kind: "redirect", location: "/evil.com/" });
  });

  test("--spa answers unknown routes without an extension with the root index.html", () => {
    const root = site();
    expect(resolveRequest(root, "/settings/profile", true)).toEqual({
      kind: "file",
      path: join(root, "index.html"),
    });
    expect(resolveRequest(root, "/missing.png", true)).toEqual({ kind: "missing" });
    expect(resolveRequest(root, "/%2e%2e/x", true)).toEqual({ kind: "missing" });
  });

  test("the reload script goes before the last </body>, or at the end", () => {
    expect(injectReload("<html><BODY>x</BODY></html>")).toMatch(
      /x<script>.*location\.reload\(\).*<\/script>\n<\/BODY><\/html>$/,
    );
    expect(injectReload("<p>fragment</p>")).toMatch(/^<p>fragment<\/p>\n<script>/);
  });

  test("listings show folders first with sizes, hide dotfiles, and link up", () => {
    const html = listingPage(join(site(), "docs"), "/docs/");
    expect(html).toContain("<title>Index of /docs/</title>");
    expect(html.indexOf("a-folder/")).toBeLessThan(html.indexOf("guide.html"));
    expect(html).toContain('<a href="/docs/z.txt">z.txt</a></td><td class="size">5 B</td>');
    expect(html).toContain('<a href="../">../</a>');
    expect(html).not.toContain(".secret");
    expect(listingPage(site(), "/")).not.toContain('href="../"');
  });

  test("HTML responses get the reload script; other files are sent as they are, with Last-Modified", async () => {
    const root = site();
    const page = await respond(root, "/", false);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain('new EventSource("/__btk/events")');
    expect(page.headers.get("last-modified")).toBeNull();
    const css = await respond(root, "/app.css", false);
    expect(css.headers.get("content-type")).toStartWith("text/css");
    expect(css.headers.get("last-modified")).toBe(
      new Date(Bun.file(join(root, "app.css")).lastModified).toUTCString(),
    );
    expect(await css.text()).toBe("h1 { color: red; }");
    const missing = await respond(root, "/nope.png", false);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("location.reload()");
    expect(notFoundPage("/a%20b")).toContain("<code>/a b</code>");
  });

  test("network URLs: none on loopback, the host itself, or one per LAN address", () => {
    expect(networkUrls("127.0.0.1", 3000)).toEqual([]);
    expect(networkUrls("192.168.1.9", 3000)).toEqual(["http://192.168.1.9:3000/"]);
    for (const url of networkUrls("0.0.0.0", 3000))
      expect(url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:3000\/$/);
  });
});
