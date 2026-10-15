import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { runBtk } from "../support/cli.ts";
import { freePort, waitForPage } from "../support/server.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

describe("btk serve", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = () => {
    project = createTempProject();
    project.write("site/index.html", "<!doctype html><html><body><h1>Home</h1></body></html>");
    project.write("site/style.css", "body {}");
    return project;
  };
  const btk = (args: string[], env: Record<string, string> = {}) =>
    runBtk(args, { cwd: project.dir, env: { ...project.env, ...env } });

  const serving = async (
    args: string[],
    check: (base: string) => Promise<void>,
    env: Record<string, string> = {},
  ) => {
    const port = freePort();
    const stop = new AbortController();
    const running = runBtk(["serve", ...args, "--no-open", "--port", String(port)], {
      cwd: project.dir,
      env: { ...project.env, ...env },
      signal: stop.signal,
    });
    const base = `http://127.0.0.1:${port}`;
    await waitForPage(base).catch(() => undefined);
    await check(base);
    stop.abort();
    return { ...(await running), base };
  };

  test("serves index.html with live reload, plain files, and stops on Ctrl+C", async () => {
    setup();
    const { code, stderr, base } = await serving(["site"], async (base) => {
      const home = await (await fetch(`${base}/`)).text();
      expect(home).toContain("<h1>Home</h1>");
      expect(home).toContain('new EventSource("/__btk/events")');
      const css = await fetch(`${base}/style.css`);
      expect(css.headers.get("content-type")).toStartWith("text/css");
      expect(css.headers.get("cache-control")).toBe("no-cache");
      expect(css.headers.get("access-control-allow-origin")).toBeNull();
    });
    expect(code).toBe(0);
    expect(stderr).toContain(`Serving site at ${base}/`);
    expect(stderr).toContain("Stopped serving site");
  });

  test("saving a file sends a reload event", async () => {
    const p = setup();
    await serving(["site"], async (base) => {
      const reader = ((await fetch(`${base}/__btk/events`)).body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      appendFileSync(join(p.dir, "site/style.css"), "h1 {}");
      const decoder = new TextDecoder();
      let seen = "";
      while (!seen.includes("event: reload")) seen += decoder.decode((await reader.read()).value);
      await reader.cancel();
    });
  });

  test("--json returns where it served; --cors adds the header", async () => {
    setup();
    const { stdout, base } = await serving(["site", "--json", "--cors"], async (base) => {
      expect((await fetch(`${base}/`)).headers.get("access-control-allow-origin")).toBe("*");
    });
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      command: "serve run",
      data: {
        root: "site",
        url: `${base}/`,
        host: "127.0.0.1",
        port: Number(base.split(":")[2]),
        network: [],
      },
    });
  });

  test("spa comes from config, env, then the flag", async () => {
    const p = setup();
    const status = async (args: string[], env?: Record<string, string>) => {
      let code = 0;
      await serving(
        ["site", ...args],
        async (base) => {
          code = (await fetch(`${base}/settings/profile`)).status;
        },
        env,
      );
      return code;
    };
    expect(await status([])).toBe(404);
    p.write("btk.config.ts", `export default { tools: { serve: { spa: true } } };`);
    expect(await status([])).toBe(200);
    expect(await status([], { BTK_SERVE_SPA: "false" })).toBe(404);
    expect(await status(["--spa"], { BTK_SERVE_SPA: "false" })).toBe(200);
  });

  test("a file serves its folder and opens that page", async () => {
    const p = setup();
    p.write("site/demo page.html", "<p>demo</p>");
    const { stdout, stderr, base } = await serving(["site/demo page.html", "--json"], async (base) => {
      expect(await (await fetch(`${base}/demo%20page.html`)).text()).toContain("<p>demo</p>");
    });
    expect(JSON.parse(stdout).data).toMatchObject({ root: "site", url: `${base}/demo%20page.html` });
    expect(stderr).toBe("");
  });

  test("a missing path fails and a bad port is rejected", async () => {
    setup();
    const missing = await btk(["serve", "nope"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("Not found: nope");
    expect((await btk(["serve", "site", "--port", "70000"])).code).toBe(2);
  });

  test("help lists the options", async () => {
    setup();
    const tool = await btk(["serve", "--help"]);
    expect(tool.code).toBe(0);
    expect(tool.stdout).toContain('same as "serve run"');
    const { stdout } = await btk(["serve", "run", "--help"]);
    for (const flag of ["--port", "--host", "--no-open", "--spa", "--cors"]) expect(stdout).toContain(flag);
  });
});
