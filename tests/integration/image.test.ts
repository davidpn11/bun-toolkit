import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runBtk } from "../support/cli.ts";
import { writeImage } from "../support/images.ts";
import { ANSI } from "../support/streams.ts";
import { createTempProject, type TempProject } from "../support/tmp.ts";

describe("btk image", () => {
  let project: TempProject;
  afterEach(() => project?.cleanup());

  const setup = async (...names: string[]) => {
    project = createTempProject();
    for (const [i, name] of names.entries()) {
      await writeImage(join(project.dir, name), {
        format: name.endsWith(".jpg") ? "jpeg" : "png",
        seed: i + 1,
      });
    }
    return project;
  };
  const btk = (args: string[], env: Record<string, string> = {}, tty = false) =>
    runBtk(args, { cwd: project.dir, env: { ...project.env, ...env }, tty });
  const json = async (args: string[], env: Record<string, string> = {}) => {
    const result = await btk([...args, "--json"], env);
    return { ...result, body: JSON.parse(result.stdout) };
  };

  test("the default action converts to WebP next to the original", async () => {
    const p = await setup("hero.png", "photo.jpg");
    const { code, body } = await json(["image", "."]);
    expect(code).toBe(0);
    expect(body).toMatchObject({ ok: true, command: "image optimize", data: { totals: { converted: 2 } } });
    expect(existsSync(join(p.dir, "hero.webp"))).toBe(true);
    expect(existsSync(join(p.dir, "photo.webp"))).toBe(true);
  });

  test("the img alias and explicit optimize action work too", async () => {
    await setup("a.png");
    expect((await btk(["img", "a.png", "-n"])).code).toBe(0);
    expect((await btk(["image", "optimize", "a.png", "-n"])).code).toBe(0);
  });

  test("human output: header, per-file table and summary", async () => {
    await setup("hero.png");
    const { stdout, stderr } = await btk(["image", "hero.png"], {}, true);
    expect(stderr).toContain("1 image → webp · q80");
    expect(stdout).toContain("hero.webp");
    expect(stdout).toContain("Done");
    expect(stdout).toContain("converted");
  });

  test("ci output is plain", async () => {
    await setup("hero.png");
    const { stdout, stderr } = await btk(["image", "hero.png"], { CI: "true" });
    expect(stdout + stderr).not.toMatch(ANSI);
    expect(stdout).toContain("Done converted=1");
  });

  test("config defaults apply; env and flags override them", async () => {
    const p = await setup("a.png");
    p.write("btk.config.ts", `export default { tools: { image: { format: "avif", quality: 50 } } };`);
    const options = async (args: string[], env: Record<string, string> = {}) =>
      (await json(["image", "a.png", "-n", ...args], env)).body.data.options;
    expect(await options([])).toMatchObject({ format: "avif", quality: 50 });
    expect(await options([], { BTK_IMAGE_QUALITY: "65" })).toMatchObject({ quality: 65 });
    expect(await options(["-q", "70", "-f", "jpeg"], { BTK_IMAGE_QUALITY: "65" })).toMatchObject({
      format: "jpeg",
      quality: 70,
    });
  });

  test("presets sit between config and explicit flags", async () => {
    const p = await setup("a.png");
    p.write(
      "btk.config.ts",
      `export default { tools: { image: { quality: 90, presets: { hero: { maxWidth: 2560, quality: 85 } } } } };`,
    );
    const options = async (args: string[]) =>
      (await json(["image", "a.png", "-n", ...args])).body.data.options;
    expect(await options(["--preset", "web"])).toMatchObject({ quality: 75, maxWidth: 1920 });
    expect(await options(["--preset", "web", "-q", "50"])).toMatchObject({ quality: 50, maxWidth: 1920 });
    expect(await options(["-p", "hero"])).toMatchObject({ quality: 85, maxWidth: 2560 });
  });

  test("presets lists built-in and configured presets", async () => {
    const p = await setup();
    p.write(
      "btk.config.ts",
      `export default { tools: { image: { presets: { hero: { maxWidth: 2560 } } } } };`,
    );
    const { stdout } = await btk(["image", "presets"], { CI: "true" });
    expect(stdout).toContain("web\tq75 · fit 1920×∞\tbuilt-in");
    expect(stdout).toContain("hero\tfit 2560×∞\tconfig");
  });

  test("unknown presets exit 2 with a suggestion", async () => {
    await setup("a.png");
    const { code, stderr } = await btk(["image", "a.png", "--preset", "thumbnial"]);
    expect(code).toBe(2);
    expect(stderr).toContain('Did you mean "thumbnail"?');
  });

  test("a batch with failures still reports everything, then exits 1", async () => {
    const p = await setup("good.png");
    p.write("bad.png", "not an image");
    const { code, body } = await json(["image", "."]);
    expect(code).toBe(1);
    expect(body.ok).toBe(false);
    expect(body.data.totals).toMatchObject({ converted: 1, failed: 1 });
  });

  test("no images found is an error with a hint", async () => {
    const p = await setup();
    p.write("notes.txt", "x");
    const { code, stderr } = await btk(["image", "."]);
    expect(code).toBe(1);
    expect(stderr).toContain("No images found");
    expect(stderr).toContain("--recursive");
  });

  test("running twice skips what exists instead of overwriting", async () => {
    await setup("a.png");
    await btk(["image", "a.png"]);
    const { code, body } = await json(["image", "."]);
    expect(code).toBe(0);
    expect(body.data.totals).toMatchObject({ converted: 0, skipped: 2 });
  });

  test("--out-dir mirrors subfolders", async () => {
    const p = await setup("a.png", "nested/b.png");
    const { code } = await btk(["image", ".", "-r", "-o", "dist"]);
    expect(code).toBe(0);
    expect(existsSync(join(p.dir, "dist/a.webp"))).toBe(true);
    expect(existsSync(join(p.dir, "dist/nested/b.webp"))).toBe(true);

    const again = await json(["image", ".", "-r", "-o", "dist"]);
    expect(again.body.data.files).toHaveLength(2);
    expect(existsSync(join(p.dir, "dist/dist"))).toBe(false);
  });

  test("invalid image config is a config error", async () => {
    const p = await setup("a.png");
    p.write("btk.config.ts", `export default { tools: { image: { quality: 200, fromat: "png" } } };`);
    const { code, stderr } = await btk(["image", "a.png"]);
    expect(code).toBe(78);
    expect(stderr).toContain("tools.image.quality");
    expect(stderr).toContain('Did you mean "format"?');
  });

  test("help lists options with config-sourced defaults", async () => {
    const p = await setup();
    p.write("btk.config.ts", `export default { tools: { image: { quality: 70 } } };`);
    const { stdout } = await btk(["image", "optimize", "--help"]);
    expect(stdout).toContain("-f, --format <webp|avif|jpeg|png|heic|original>");
    expect(stdout).toContain("(default: 70 from project config)");
    expect(stdout).toContain("--preset <web|thumbnail|social>");
  });

  test("info shows one image as key-value and several as a table", async () => {
    await setup("a.png", "b.jpg");
    const one = await btk(["image", "info", "a.png"], { CI: "true" });
    expect(one.stdout).toContain("dimensions: 320 × 240");
    const many = await btk(["image", "info", "."], { CI: "true" });
    expect(many.stdout).toContain("file\tformat\tdimensions\tMP\tsize");
    const withPlaceholder = await json(["image", "info", "a.png", "--placeholder"]);
    expect(withPlaceholder.body.data.images[0].placeholder).toStartWith("data:image/png;base64,");
  });

  test("info exits 1 when something is missing", async () => {
    await setup("a.png");
    const { code, stdout } = await btk(["image", "info", "a.png", "nope.png"], { CI: "true" });
    expect(code).toBe(1);
    expect(stdout).toContain("Nothing matched nope.png");
  });
});
