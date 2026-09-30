import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempProject, type TempProject } from "../../../tests/support/tmp.ts";
import { UsageError } from "../../errors.ts";
import { CodecError, compressBytes, decompressBytes } from "./codec.ts";
import { type CompressPlan, compressInputs } from "./compress.ts";
import { decompressInputs } from "./decompress.ts";
import { detectFromName, FORMATS, isTar, resolveLevel, sniffFormat } from "./formats.ts";

let project: TempProject;
afterEach(() => project?.cleanup());

const text = new TextEncoder().encode("the quick brown fox jumps over the lazy dog\n".repeat(200));
const noise = crypto.getRandomValues(new Uint8Array(4096));
const plan = (patch: Partial<CompressPlan> = {}): CompressPlan => ({
  formats: ["gzip"],
  overwrite: false,
  dryRun: false,
  each: false,
  recursive: false,
  ...patch,
});
const decompressPlan = { overwrite: false, dryRun: false, recursive: false };

describe("formats", () => {
  test("levels default per format and are checked against its range", () => {
    expect(resolveLevel("gzip", undefined)).toBe(9);
    expect(resolveLevel("zstd", undefined)).toBe(19);
    expect(resolveLevel("brotli", 0)).toBe(0);
    expect(() => resolveLevel("brotli", 12)).toThrow("brotli levels go from 0 to 11, not 12");
    expect(() => resolveLevel("gzip", 0)).toThrow(UsageError);
  });

  test("names, tar names and magic bytes", () => {
    expect(detectFromName("/x/app.js.gz")).toEqual({ format: "gzip", tar: false, stem: "app.js" });
    expect(detectFromName("site.tar.zst")).toEqual({ format: "zstd", tar: true, stem: "site" });
    expect(detectFromName("site.TGZ")).toEqual({ format: "gzip", tar: true, stem: "site" });
    expect(detectFromName("style.css.br")?.format).toBe("brotli");
    expect(detectFromName("notes.txt")).toBeUndefined();
    expect(sniffFormat(Bun.gzipSync(text))).toBe("gzip");
    expect(sniffFormat(Bun.zstdCompressSync(text))).toBe("zstd");
    expect(sniffFormat(text)).toBeUndefined();
  });
});

describe("codec", () => {
  test("every format round-trips at its lowest and highest level", async () => {
    for (const format of FORMATS) {
      for (const level of [resolveLevel(format, undefined), format === "brotli" ? 0 : 1]) {
        const packed = await compressBytes(text, format, level);
        expect(packed.byteLength).toBeLessThan(text.byteLength);
        expect(await decompressBytes(packed, format)).toEqual(new Uint8Array(text));
      }
    }
  });

  test("bad data is a readable error", async () => {
    await expect(decompressBytes(new Uint8Array([1, 2, 3]), "zstd")).rejects.toBeInstanceOf(CodecError);
  });
});

describe("compressInputs()", () => {
  test("writes next to the original, keeps it, and one file per format", async () => {
    project = createTempProject();
    project.write("app.js", new TextDecoder().decode(text));
    const report = await compressInputs(["app.js"], project.dir, plan({ formats: ["gzip", "brotli"] }));
    expect(report.totals).toMatchObject({ done: 2, skipped: 0, failed: 0 });
    expect(existsSync(join(project.dir, "app.js"))).toBe(true);
    expect(Bun.gunzipSync(readFileSync(join(project.dir, "app.js.gz")))).toEqual(new Uint8Array(text));
    expect(existsSync(join(project.dir, "app.js.br"))).toBe(true);
  });

  test("skips existing outputs and files that would not shrink", async () => {
    project = createTempProject();
    project.write("app.js", "x".repeat(1000));
    await Bun.write(join(project.dir, "photo.bin"), noise);
    await compressInputs(["app.js"], project.dir, plan());
    const report = await compressInputs(["app.js", "photo.bin"], project.dir, plan());
    expect(report.results.map((r) => r.code)).toEqual(["SKIP_EXISTS", "SKIP_NO_GAIN"]);
    expect(existsSync(join(project.dir, "photo.bin.gz"))).toBe(false);
  });

  test("a folder becomes one archive; --each compresses the files inside", async () => {
    project = createTempProject();
    project.write("site/index.html", "<p>hello</p>".repeat(50));
    project.write("site/css/app.css", "body{}".repeat(50));
    project.write("site/css/app.css.gz", "already compressed");
    const archive = await compressInputs(["site"], project.dir, plan({ formats: ["zstd"] }));
    expect(archive.results[0]).toMatchObject({ kind: "folder", status: "done", files: 3 });
    expect(existsSync(join(project.dir, "site.tar.zst"))).toBe(true);

    const each = await compressInputs(["site"], project.dir, plan({ each: true }));
    expect(each.results.map((r) => r.output.slice(project.dir.length + 1)).sort()).toEqual([
      "site/css/app.css.gz",
      "site/index.html.gz",
    ]);
    expect(each.results.find((r) => r.input.endsWith("app.css"))?.code).toBe("SKIP_EXISTS");
  });

  test("-o needs exactly one output; dry runs write nothing", async () => {
    project = createTempProject();
    project.write("a.txt", "a".repeat(500));
    await expect(
      compressInputs(["a.txt"], project.dir, plan({ formats: ["gzip", "zstd"], output: "x" })),
    ).rejects.toThrow("-o takes one input");
    const dry = await compressInputs(["a.txt"], project.dir, plan({ dryRun: true }));
    expect(dry.totals.done).toBe(1);
    expect(existsSync(join(project.dir, "a.txt.gz"))).toBe(false);
  });

  test("reports progress per output and stops starting new work once aborted", async () => {
    project = createTempProject();
    project.write("a.txt", "a".repeat(500));
    project.write("b.txt", "b".repeat(500));
    const events: string[] = [];
    await compressInputs(["a.txt", "b.txt"], project.dir, plan({ formats: ["gzip", "zstd"] }), {
      onStart: (total) => events.push(`start ${total}`),
      onProgress: () => events.push("tick"),
    });
    expect(events).toEqual(["start 4", "tick", "tick", "tick", "tick"]);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await compressInputs(["a.txt"], project.dir, plan({ overwrite: true }), {
      signal: controller.signal,
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.results[0]).toMatchObject({ status: "skipped", code: "ERR_CANCELLED" });
  });
});

describe("decompressInputs()", () => {
  test("restores files next to the archive, and never replaces them without --overwrite", async () => {
    project = createTempProject();
    await Bun.write(join(project.dir, "notes.txt.br"), await compressBytes(text, "brotli", 5));
    const first = await decompressInputs(["notes.txt.br"], project.dir, decompressPlan);
    expect(first.results[0]).toMatchObject({ status: "done", kind: "file", format: "brotli" });
    expect(readFileSync(join(project.dir, "notes.txt"))).toEqual(Buffer.from(text));
    const again = await decompressInputs(["notes.txt.br"], project.dir, decompressPlan);
    expect(again.results[0]?.code).toBe("SKIP_EXISTS");
  });

  test("archives extract like tar -x: one root folder next to the archive, loose files into a folder", async () => {
    project = createTempProject();
    project.write("site/a.txt", "hello");
    await compressInputs(["site"], project.dir, plan({ formats: ["gzip"] }));
    const moved = join(project.dir, "out");
    await Bun.write(join(moved, "site.tar.gz"), Bun.file(join(project.dir, "site.tar.gz")));
    const nested = await decompressInputs([join(moved, "site.tar.gz")], project.dir, decompressPlan);
    expect(nested.results[0]).toMatchObject({ kind: "folder", files: 1, output: join(moved, "site") });
    expect(readFileSync(join(moved, "site/a.txt"), "utf8")).toBe("hello");

    const loose = await new Bun.Archive({ "x.txt": "x", "y.txt": "y" }).bytes();
    await Bun.write(join(project.dir, "bundle.tgz"), Bun.gzipSync(loose));
    await decompressInputs(["bundle.tgz"], project.dir, decompressPlan);
    expect(readFileSync(join(project.dir, "bundle/y.txt"), "utf8")).toBe("y");
    expect(isTar(loose)).toBe(true);
  });

  test("unknown files fail unless --format or magic bytes say what they are", async () => {
    project = createTempProject();
    await Bun.write(join(project.dir, "data.bin"), Bun.zstdCompressSync(text));
    await Bun.write(join(project.dir, "blob.bin"), await compressBytes(text, "brotli", 5));
    const sniffed = await decompressInputs(["data.bin"], project.dir, decompressPlan);
    expect(sniffed.results[0]).toMatchObject({
      status: "done",
      format: "zstd",
      output: join(project.dir, "data.bin.out"),
    });
    const unknown = await decompressInputs(["blob.bin"], project.dir, decompressPlan);
    expect(unknown.results[0]).toMatchObject({ status: "failed", code: "ERR_UNKNOWN_FORMAT" });
    const forced = await decompressInputs(["blob.bin"], project.dir, { ...decompressPlan, format: "brotli" });
    expect(forced.results[0]?.status).toBe("done");
  });

  test("-o with several inputs is a usage error instead of being ignored", async () => {
    project = createTempProject();
    await Bun.write(join(project.dir, "a.txt.gz"), Bun.gzipSync(text));
    await Bun.write(join(project.dir, "b.txt.gz"), Bun.gzipSync(text));
    await expect(
      decompressInputs(["a.txt.gz", "b.txt.gz"], project.dir, { ...decompressPlan, output: "joined.txt" }),
    ).rejects.toThrow("-o takes one input");
    expect(existsSync(join(project.dir, "a.txt"))).toBe(false);
  });
});
