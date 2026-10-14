import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { btkCommand, spawnBtk } from "../support/cli.ts";
import { dotSlash } from "../support/paths.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

export function defineCliSuite(label: string): void {
  describe(`btk end-to-end (${label})`, () => {
    let project: TempProject;
    afterEach(() => project?.cleanup());

    const btk = (args: string[], env: Record<string, string> = {}) => {
      project ??= createTempProject();
      return spawnBtk(args, { cwd: project.dir, env: { ...project.env, ...env } as Record<string, string> });
    };
    const fresh = () => {
      project = createTempProject();
      return project;
    };

    test("--version prints the version", async () => {
      fresh();
      const { code, stdout } = await btk(["--version"]);
      expect(code).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("--help lists every command", async () => {
      fresh();
      const { code, stdout } = await btk(["--help"]);
      expect(code).toBe(0);
      for (const command of ["info", "init", "config", "ui"]) expect(stdout).toContain(command);
      expect(stdout).toContain("Global options");
    });

    test("<command> --help shows options and examples", async () => {
      fresh();
      const { code, stdout } = await btk(["init", "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("--global");
      expect(stdout).toContain("Examples");
    });

    test("info prints environment details", async () => {
      fresh();
      const { code, stdout } = await btk(["info"]);
      expect(code).toBe(0);
      expect(stdout).toContain("bun-toolkit");
      expect(stdout).toContain("platform");
    });

    test("info --json prints one valid JSON envelope", async () => {
      fresh();
      const { code, stdout, stderr } = await btk(["info", "--json"]);
      expect(code).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.ok).toBe(true);
      expect(data.command).toBe("info");
      expect(data.data).toHaveProperty("version");
      expect(data.data).toHaveProperty("platform");
      expect(stderr).toBe("");
    });

    test("AGENT=true switches to JSON", async () => {
      fresh();
      const { stdout } = await btk(["info"], { AGENT: "true" });
      expect(JSON.parse(stdout).ok).toBe(true);
    });

    test("CI=true output has no ANSI codes", async () => {
      fresh();
      const { stdout, stderr } = await btk(["info"], { CI: "true" });
      expect(stdout + stderr).not.toMatch(ANSI);
      expect(stdout).toContain("output: ci (CI=true)");
    });

    test("unknown commands exit 2 with a suggestion", async () => {
      fresh();
      const { code, stderr } = await btk(["ifno"]);
      expect(code).toBe(2);
      expect(stderr).toContain('Unknown command "ifno"');
      expect(stderr).toContain('Did you mean "btk info"?');
    });

    test("unknown options exit 2; json mode reports the error as JSON", async () => {
      fresh();
      const text = await btk(["init", "--forse"]);
      expect(text.code).toBe(2);
      expect(text.stderr).toContain("Did you mean --force?");

      const json = await btk(["init", "--forse", "--json"]);
      expect(json.code).toBe(2);
      expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "ERR_UNKNOWN_OPTION" } });
    });

    test("init creates a project config; a second init refuses without --force", async () => {
      const p = fresh();
      const first = await btk(["init"]);
      expect(first.code).toBe(0);
      const path = join(p.dir, "btk.config.ts");
      expect(readFileSync(path, "utf8")).toContain('import { defineConfig } from "bun-toolkit"');

      const second = await btk(["init"]);
      expect(second.code).toBe(1);
      expect(second.stderr).toContain("--force");

      expect((await btk(["init", "--force"])).code).toBe(0);
    });

    test("init --global writes to the global dir, and the result validates", async () => {
      const p = fresh();
      expect((await btk(["init", "--global"])).code).toBe(0);
      expect(existsSync(join(p.globalDir, "config.ts"))).toBe(true);
      const { code, stdout } = await btk(["config", "validate"]);
      expect(code).toBe(0);
      expect(stdout).toContain("(global)");
    });

    test("project config overrides global config, and config show says where values come from", async () => {
      const p = fresh();
      p.writeGlobal(`export default { output: { verbose: false, color: false } };`);
      p.write(
        "btk.config.ts",
        `import { defineConfig } from "bun-toolkit";\nexport default defineConfig({ output: { color: true } });`,
      );
      const { code, stdout } = await btk(["config", "show", "--json"]);
      expect(code).toBe(0);
      const rows = JSON.parse(stdout).data.values as { key: string; value: unknown; source: string }[];
      expect(rows.find((r) => r.key === "output.color")).toMatchObject({
        value: true,
        source: "project",
      });
      expect(rows.find((r) => r.key === "output.verbose")).toMatchObject({ value: false, source: "global" });
    });

    test("invalid config: validate exits 78 and lists every problem with a suggestion", async () => {
      const p = fresh();
      p.write("btk.config.ts", `export default { output: { verbose: "yes" }, toolz: {} };`);
      const { code, stderr } = await btk(["config", "validate"]);
      expect(code).toBe(78);
      expect(stderr).toContain(`${dotSlash("btk.config.ts")} (project)`);
      expect(stderr).toContain('output.verbose  Expected boolean, received "yes"');
      expect(stderr).toContain('Did you mean "tools"?');
    });

    test("commands that need config fail with the config error; info still runs", async () => {
      const p = fresh();
      p.write("btk.config.ts", `export default { output: { verbose: 1 } };`);
      expect((await btk(["config", "show"])).code).toBe(78);
      const info = await btk(["info"]);
      expect(info.code).toBe(0);
      expect(info.stdout).toContain("invalid");
    });

    test("a config that fails to load reports the file", async () => {
      const p = fresh();
      p.write("btk.config.ts", "export default {");
      const { code, stderr } = await btk(["config", "validate"]);
      expect(code).toBe(78);
      expect(stderr).toContain("Could not load the configuration");
      expect(stderr).toContain(dotSlash("btk.config.ts"));
    });

    test("JSON project and global configs set tool defaults", async () => {
      const p = fresh();
      p.writeGlobal(`{ "tools": { "hash": { "algorithm": "sha1" } } }`, "config.json");
      const fromGlobal = await spawnBtk(["hash"], { cwd: p.dir, env: p.env, stdin: "hello" });
      expect(fromGlobal.stdout).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d  -\n");

      p.write("bun-toolkit.config.json", `{ "tools": { "hash": { "algorithm": "md5" } } }`);
      const fromProject = await spawnBtk(["hash"], { cwd: p.dir, env: p.env, stdin: "hello" });
      expect(fromProject.stdout).toBe("5d41402abc4b2a76b9719d911017c592  -\n");
    });

    describe("without a local config", () => {
      const WARNING = "No local config found";
      const unset = { BTK_NO_LOCAL_CONFIG: "" };
      const hashFile = (env: Record<string, string> = unset, args: string[] = []) => {
        project.write("a.txt", "hello");
        return btk(["hash", "a.txt", ...args], env);
      };

      test("warn (the default) prints a warning and a hint on stderr, then runs", async () => {
        fresh();
        const { code, stdout, stderr } = await hashFile();
        expect(code).toBe(0);
        expect(stdout).toStartWith("2cf24dba");
        expect(stderr).toContain(`${WARNING}, using built-in defaults`);
        expect(stderr).toContain('Create one with "btk init", or set noLocalConfig: "off"');

        project.writeGlobal(`{ "tools": {} }`, "config.json");
        expect((await hashFile()).stderr).toContain(`${WARNING}, using the global config`);
      });

      test('"off" in the global config is silent', async () => {
        fresh().writeGlobal(`{ "noLocalConfig": "off" }`, "config.json");
        const { code, stderr } = await hashFile();
        expect(code).toBe(0);
        expect(stderr).not.toContain(WARNING);
      });

      test('"error" exits 78 with the hint', async () => {
        fresh().writeGlobal(`export default { noLocalConfig: "error" };`);
        const { code, stdout, stderr } = await hashFile();
        expect(code).toBe(78);
        expect(stdout).toBe("");
        expect(stderr).toContain(`${WARNING} (noLocalConfig is "error")`);
        expect(stderr).toContain("btk init");
      });

      test("a local config, json mode, help and non-tool commands never warn", async () => {
        fresh();
        expect((await hashFile(unset, ["--json"])).stderr).not.toContain(WARNING);
        for (const args of [["info"], ["config", "show"], ["hash", "--help"]]) {
          expect((await btk(args, unset)).stderr).not.toContain(WARNING);
        }
        project.write("btk.config.json", "{}");
        expect((await hashFile()).stderr).not.toContain(WARNING);
      });
    });

    test("init --format json writes JSON configs that validate", async () => {
      const p = fresh();
      expect((await btk(["init", "--format", "json"])).code).toBe(0);
      expect(JSON.parse(readFileSync(join(p.dir, "btk.config.json"), "utf8"))).toEqual({
        tools: {},
        output: {},
      });

      expect((await btk(["init", "--global", "--format", "json"])).code).toBe(0);
      const global = JSON.parse(readFileSync(join(p.globalDir, "config.json"), "utf8"));
      expect(global.noLocalConfig).toBe("warn");

      const { code, stdout } = await btk(["config", "validate"]);
      expect(code).toBe(0);
      expect(stdout).toContain("config.json (global)");
      expect(stdout).toContain("btk.config.json (project)");
    });

    test("hash reads a pipe and matches sha256sum output", async () => {
      const p = fresh();
      const { code, stdout } = await spawnBtk(["hash"], { cwd: p.dir, env: p.env, stdin: "hello" });
      expect(code).toBe(0);
      expect(stdout).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  -\n");
    });

    test("convert reads a pipe and writes the result to stdout", async () => {
      const p = fresh();
      const { code, stdout } = await spawnBtk(["convert", "--from", "yaml", "--to", "toml"], {
        cwd: p.dir,
        env: p.env,
        stdin: "name: app\nport: 8080\n",
      });
      expect(code).toBe(0);
      expect(stdout).toBe('name = "app"\nport = 8080\n');
    });

    test("compressed bytes survive a pipe from compress into decompress", async () => {
      const p = fresh();
      const body = "binary-safe round trip\n".repeat(500);
      const packed = Bun.spawn([...btkCommand(), "compress", "--zstd"], {
        cwd: p.dir,
        env: p.env,
        stdin: new Blob([body]),
        stdout: "pipe",
        stderr: "pipe",
      });
      const bytes = await new Response(packed.stdout).bytes();
      expect(await packed.exited).toBe(0);
      const unpacked = await spawnBtk(["decompress"], { cwd: p.dir, env: p.env, stdin: bytes });
      expect(unpacked.code).toBe(0);
      expect(unpacked.stdout).toBe(body);
    });

    test("password hash reads a pipe and prints a verifiable hash", async () => {
      const p = fresh();
      const { code, stdout } = await spawnBtk(
        ["password", "hash", "--memory-cost", "1024", "--time-cost", "1"],
        {
          cwd: p.dir,
          env: p.env,
          stdin: "s3cret\n",
        },
      );
      expect(code).toBe(0);
      expect(await Bun.password.verify("s3cret", stdout.trim())).toBe(true);
    });

    test("md preview renders a pipe for the terminal", async () => {
      const p = fresh();
      const { code, stdout } = await spawnBtk(["md"], { cwd: p.dir, env: p.env, stdin: "# Hi\n\n- one\n" });
      expect(code).toBe(0);
      expect(stdout).toBe("Hi\n──\n\n  • one\n");
    });

    test("a plugin importing bun-toolkit adds an md theme", async () => {
      const p = fresh();
      p.write("README.md", "- one\n");
      p.write(
        "btk.config.ts",
        `import { defineConfig, definePlugin, defineTheme } from "bun-toolkit";
const arrows = defineTheme({ name: "arrows", terminal: { glyphs: { bullets: ["→"] } } });
const plugin = definePlugin(() => ({ name: "arrows", setup: (hooks) => hooks.on("md:theme", () => arrows) }));
export default defineConfig({ plugins: [plugin()] });`,
      );
      expect((await btk(["md", "themes"])).stdout).toContain("arrows");
      const { code, stdout } = await btk(["md", "README.md", "--theme", "arrows"]);
      expect(code).toBe(0);
      expect(stdout).toBe("  → one\n");
    });

    test("a reader that closes its pipe early ends btk quietly with 0", async () => {
      const p = fresh();
      p.write("long.md", "# Title\n\n".concat("A paragraph of text.\n\n".repeat(2000)));
      for (const args of [
        ["md", "long.md", "--terminal"],
        ["info", "--json"],
      ]) {
        const proc = Bun.spawn([...btkCommand(), ...args], {
          cwd: p.dir,
          env: p.env,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.stdout.cancel();
        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
        expect(stderr).not.toContain("EPIPE");
        expect(code).toBe(0);
      }
    });

    test("ui without a terminal exits 2 with a hint", async () => {
      fresh();
      const { code, stderr } = await btk(["ui"]);
      expect(code).toBe(2);
      expect(stderr).toContain("The interactive dashboard needs a terminal");
    });
  });
}
