import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeImage } from "../../../tests/support/images.ts";
import { posixRelative } from "../../../tests/support/paths.ts";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { UsageError } from "../../errors.ts";
import { collectImages, type ImageFile } from "./collect.ts";
import { describeImageError } from "./errors.ts";
import { inspectImages, readImageInfo } from "./info.ts";
import { optimizeImage, optimizeImages, outputPathFor, planBatch } from "./optimize.ts";
import { applyPreset, buildOptions, describeOptions, type OptimizeOptions } from "./options.ts";
import { resolvePreset } from "./presets.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const defaults: OptimizeOptions = {
  format: "webp",
  quality: 80,
  lossless: false,
  palette: false,
  overwrite: false,
  dryRun: false,
};
const opts = (patch: Partial<OptimizeOptions> = {}): OptimizeOptions => ({ ...defaults, ...patch });
const fileAt = (path: string): ImageFile => ({ path, base: join(path, "..") });

async function setup(): Promise<string> {
  project = createTempProject();
  return project.dir;
}

describe("collectImages()", () => {
  test("folders, recursion, hidden folders, node_modules, globs, missing and non-images", async () => {
    const dir = await setup();
    await writeImage(join(dir, "a.png"));
    await writeImage(join(dir, "B.JPG"), { format: "jpeg" });
    await writeImage(join(dir, "nested/c.webp"), { format: "webp" });
    await writeImage(join(dir, ".cache/hidden.png"));
    await writeImage(join(dir, "node_modules/pkg/logo.png"));
    project.write("notes.txt", "x");

    const flat = await collectImages(["."], { cwd: dir, recursive: false });
    expect(flat.files.map((f) => posixRelative(dir, f.path))).toEqual(["a.png", "B.JPG"]);

    const deep = await collectImages(["."], { cwd: dir, recursive: true });
    expect(deep.files.map((f) => posixRelative(dir, f.path))).toEqual(["a.png", "B.JPG", "nested/c.webp"]);

    const mixed = await collectImages(["a.png", "a.png", "notes.txt", "nope.png", "**/*.webp", "*.gif"], {
      cwd: dir,
      recursive: false,
    });
    expect(mixed.files.map((f) => posixRelative(dir, f.path))).toEqual(["a.png", "nested/c.webp"]);
    expect(mixed.ignored).toEqual(["notes.txt"]);
    expect(mixed.missing).toEqual(["nope.png", "*.gif"]);
  });
});

describe("outputPathFor()", () => {
  test("next to the original, or mirrored under --out-dir", () => {
    const file = { path: resolve("/p/assets/icons/a.png"), base: resolve("/p/assets") };
    expect(outputPathFor(file, "webp")).toBe(resolve("/p/assets/icons/a.webp"));
    expect(outputPathFor(file, "jpeg", resolve("/out"))).toBe(resolve("/out/icons/a.jpg"));
  });
});

describe("presets and options", () => {
  test("explicit flags beat the preset, the preset beats config", () => {
    const preset = resolvePreset("web");
    const merged = applyPreset(opts({ quality: 90 }), preset, { quality: "config", maxWidth: "default" });
    expect(merged).toMatchObject({ quality: 75, maxWidth: 1920 });
    const explicit = applyPreset(opts({ quality: 50 }), preset, { quality: "flag" });
    expect(explicit.quality).toBe(50);
  });

  test("config presets extend and override the built-ins", () => {
    expect(resolvePreset("hero", { hero: { maxWidth: 2560 } })).toEqual({ maxWidth: 2560 });
    expect(resolvePreset("web", { web: { quality: 60 } })).toEqual({ quality: 60 });
  });

  test("unknown presets suggest the closest name", () => {
    try {
      resolvePreset("wbe");
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).hint).toBe('Did you mean "web"?');
    }
  });

  test("buildOptions resolves outDir and describeOptions summarizes", () => {
    expect(buildOptions({ ...defaults, outDir: "dist" }, "/p").outDir).toBe(resolve("/p/dist"));
    expect(describeOptions(opts({ maxWidth: 800 }))).toBe("webp · q80 · fit 800×∞");
    expect(describeOptions(opts({ format: "png", palette: true }))).toBe("png · palette");
    expect(describeOptions(opts({ lossless: true }))).toBe("webp · lossless");
  });
});

describe("optimizeImage()", () => {
  test("converts to WebP next to the original and reports sizes", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "hero.png"), { width: 640, height: 480 });
    const result = await optimizeImage(fileAt(input), opts());
    expect(result).toMatchObject({
      status: "converted",
      output: join(dir, "hero.webp"),
      before: { format: "png", width: 640, height: 480 },
      after: { format: "webp", width: 640, height: 480 },
    });
    expect(result.after?.bytes).toBe(statSync(join(dir, "hero.webp")).size);
    expect(result.savedPercent).toBeGreaterThan(0);
  });

  test("fits inside max dimensions and never enlarges", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "wide.png"), { width: 800, height: 400 });
    const shrunk = await optimizeImage(fileAt(input), opts({ maxWidth: 400, dryRun: true }));
    expect(shrunk.after).toMatchObject({ width: 400, height: 200 });
    const tall = await optimizeImage(fileAt(input), opts({ maxHeight: 100, dryRun: true }));
    expect(tall.after).toMatchObject({ width: 200, height: 100 });
    const kept = await optimizeImage(fileAt(input), opts({ maxWidth: 4000, dryRun: true }));
    expect(kept.after).toMatchObject({ width: 800, height: 400 });
  });

  test("never replaces files without --overwrite", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "a.png"));
    await writeImage(join(dir, "a.webp"), { format: "webp" });
    expect(await optimizeImage(fileAt(input), opts())).toMatchObject({
      status: "skipped",
      code: "SKIP_EXISTS",
    });

    const webp = await writeImage(join(dir, "b.webp"), { format: "webp" });
    expect(await optimizeImage(fileAt(webp), opts())).toMatchObject({
      status: "skipped",
      code: "SKIP_IN_PLACE",
    });
  });

  test("keeps the original when re-encoding in place would make it larger", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "small.webp"), { format: "webp", quality: 20 });
    const before = statSync(input).size;
    const result = await optimizeImage(fileAt(input), opts({ format: "original", overwrite: true }));
    expect(result).toMatchObject({ status: "skipped", code: "SKIP_LARGER" });
    expect(statSync(input).size).toBe(before);
  });

  test("optimizes in place with --overwrite when it helps", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "photo.jpg"), { format: "jpeg", quality: 100 });
    const before = statSync(input).size;
    const result = await optimizeImage(
      fileAt(input),
      opts({ format: "original", quality: 60, overwrite: true }),
    );
    expect(result).toMatchObject({ status: "converted", output: input });
    expect(statSync(input).size).toBeLessThan(before);
  });

  test("dry runs write nothing", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "a.png"));
    const result = await optimizeImage(fileAt(input), opts({ dryRun: true }));
    expect(result.status).toBe("converted");
    expect(existsSync(join(dir, "a.webp"))).toBe(false);
  });

  test("palette PNGs are smaller than lossless ones", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "src.bmp"), { format: "bmp", width: 400, height: 300 });
    const lossless = await optimizeImage(fileAt(input), opts({ format: "png", dryRun: true }));
    const palette = await optimizeImage(fileAt(input), opts({ format: "png", palette: true, dryRun: true }));
    expect(palette.after?.bytes ?? 0).toBeLessThan(lossless.after?.bytes ?? 0);
  });

  test("decode-only formats need an explicit output format", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "scan.bmp"), { format: "bmp" });
    const result = await optimizeImage(fileAt(input), opts({ format: "original" }));
    expect(result).toMatchObject({ status: "failed", code: "ERR_IMAGE_NOT_ENCODABLE" });
    expect(result.hint).toContain("--format webp");
  });

  test("broken files fail with a readable reason", async () => {
    const dir = await setup();
    const input = project.write("broken.png", "not an image");
    const result = await optimizeImage(fileAt(input), opts());
    expect(result).toMatchObject({ status: "failed", code: "ERR_IMAGE_UNKNOWN_FORMAT" });
    expect(result.reason).toContain("Not a recognized image");
    expect(existsSync(join(dir, "broken.webp"))).toBe(false);
  });
});

describe("planBatch()", () => {
  test("leaves earlier outputs alone and resolves collisions to the best source", () => {
    const files = ["a.jpg", "a.png", "a.webp", "b.webp"].map((name) => ({
      path: resolve("/p", name),
      base: resolve("/p"),
    }));
    const webp = planBatch(files, opts());
    expect(webp.get(2)).toMatchObject({ code: "SKIP_PREVIOUS_OUTPUT" });
    expect(webp.get(1)).toBeUndefined();
    expect(webp.get(0)).toMatchObject({
      code: "SKIP_DUPLICATE_OUTPUT",
      reason: "a.png also becomes a.webp; converting that one",
    });
    expect(webp.has(3)).toBe(false);
    expect(planBatch(files, opts({ format: "original" })).size).toBe(0);
  });
});

describe("optimizeImages()", () => {
  test("reports progress for every file and totals only converted ones", async () => {
    const dir = await setup();
    await writeImage(join(dir, "a.png"), { seed: 1 });
    await writeImage(join(dir, "b.png"), { seed: 2 });
    project.write("c.png", "broken");
    const collected = await collectImages(["."], { cwd: dir, recursive: false });
    const events: string[] = [];
    const report = await optimizeImages(collected, opts(), { onProgress: (e) => events.push(e.type) });
    expect(events.filter((e) => e === "done")).toHaveLength(3);
    expect(report.totals).toMatchObject({ converted: 2, skipped: 0, failed: 1 });
    expect(report.totals.beforeBytes).toBeGreaterThan(report.totals.afterBytes);
    expect(report.cancelled).toBe(false);
  });

  test("an aborted signal skips the remaining files", async () => {
    const dir = await setup();
    for (const name of ["a", "b", "c"]) await writeImage(join(dir, `${name}.png`));
    const collected = await collectImages(["."], { cwd: dir, recursive: false });
    const controller = new AbortController();
    const report = await optimizeImages(collected, opts(), {
      signal: controller.signal,
      concurrency: 1,
      onProgress: (e) => {
        if (e.type === "done") controller.abort();
      },
    });
    expect(report.cancelled).toBe(true);
    expect(report.files.map((f) => f.status)).toEqual(["converted", "skipped", "skipped"]);
    expect(report.files[1]?.reason).toBe("Cancelled");
  });
});

describe("info", () => {
  test("reads format, dimensions and an optional placeholder", async () => {
    const dir = await setup();
    const input = await writeImage(join(dir, "a.png"), { width: 1000, height: 500 });
    const info = await readImageInfo(input, { placeholder: true });
    expect(info).toMatchObject({ format: "png", width: 1000, height: 500, megapixels: 0.5 });
    expect(info.placeholder).toStartWith("data:image/png;base64,");
  });

  test("inspectImages separates failures", async () => {
    const dir = await setup();
    await writeImage(join(dir, "a.png"));
    project.write("b.png", "nope");
    const report = await inspectImages(await collectImages(["."], { cwd: dir, recursive: false }));
    expect(report.images).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ code: "ERR_IMAGE_UNKNOWN_FORMAT" });
  });
});

describe("describeImageError()", () => {
  test("explains unsupported encoders with a fix", () => {
    const error = Object.assign(new Error("nope"), { code: "ERR_IMAGE_FORMAT_UNSUPPORTED" });
    expect(describeImageError(error, "avif")).toMatchObject({
      message: "AVIF is not supported on this machine",
      hint: expect.stringContaining("--format webp"),
    });
    expect(describeImageError(Object.assign(new Error("x"), { code: "ENOENT" })).message).toBe(
      "File not found",
    );
  });
});
