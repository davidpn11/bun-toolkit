import { describe, expect, test } from "bun:test";
import { ANSI, CaptureStream } from "../../tests/support/streams.ts";
import type { OutputMode } from "../env.ts";
import { BtkError, UsageError } from "../errors.ts";
import { createReporter } from "./reporter.ts";

function setup(mode: OutputMode, tty = mode === "human") {
  const stdout = new CaptureStream({ isTTY: tty });
  const stderr = new CaptureStream({ isTTY: tty });
  const reporter = createReporter({ mode, stdout, stderr, color: mode === "human" });
  return { reporter, stdout, stderr };
}

const rows = [
  { file: "a.png", size: "10 KB" },
  { file: "bb.png", size: "2 KB" },
];

describe("createReporter()", () => {
  test("escapes terminal control sequences but keeps color and links", () => {
    const { reporter, stdout } = setup("human");
    const link = "\x1b]8;;https://bun.sh\x1b\\bun\x1b]8;;\x1b\\";
    reporter.out.text(`a\x1b]52;c;aGk=\x07b\rc ${reporter.out.style.bold("x")} ${link}`);
    expect(stdout.text).toContain("a\\x1b]52;c;aGk=\\x07b\\x0dc");
    expect(stdout.text).toMatch(ANSI);
    expect(stdout.text).toContain(link);
  });

  test("human: styled logs to stderr, results to stdout", () => {
    const { reporter, stdout, stderr } = setup("human");
    reporter.log.success("done");
    reporter.out.table(rows, { title: "Files" });
    expect(stderr.text).toContain("✔");
    expect(stderr.text).toMatch(ANSI);
    expect(stdout.text).toContain("Files");
    expect(stdout.text).toContain("bb.png");
  });

  test("human mode without a TTY on stdout keeps stdout free of ANSI", () => {
    const stdout = new CaptureStream({ isTTY: false });
    const stderr = new CaptureStream({ isTTY: true });
    const reporter = createReporter({ mode: "human", stdout, stderr });
    reporter.out.keyValue({ a: 1 }, "Title");
    expect(stdout.text).not.toMatch(ANSI);
  });

  test("ci: no ANSI anywhere, tables are tab-separated", () => {
    const { reporter, stdout, stderr } = setup("ci");
    reporter.log.info("working");
    reporter.log.warn("careful");
    reporter.out.table(rows);
    reporter.out.summary({ files: 2 });
    reporter.spinner.start("spin");
    reporter.spinner.succeed("spun");
    reporter.progress.start(2, "files");
    reporter.progress.tick();
    reporter.progress.tick();
    reporter.progress.done();
    expect(stdout.text + stderr.text).not.toMatch(ANSI);
    expect(stdout.text).toContain("file\tsize");
    expect(stdout.text).toContain("a.png\t10 KB");
    expect(stderr.text).toContain("✔ spun");
    expect(stderr.text).toContain("files (2/2");
  });

  test("json: logs, spinners and components are silent; json() writes stdout", () => {
    const { reporter, stdout, stderr } = setup("json", false);
    reporter.log.info("hidden");
    reporter.spinner.start("hidden");
    reporter.out.table(rows);
    reporter.json({ ok: true, data: { n: 1 } });
    expect(stderr.text).toBe("");
    expect(JSON.parse(stdout.text)).toEqual({ ok: true, data: { n: 1 } });
  });

  test("debug logs only show when verbose", () => {
    const quiet = setup("ci");
    quiet.reporter.log.debug("secret");
    expect(quiet.stderr.text).toBe("");

    const stderr = new CaptureStream();
    createReporter({ mode: "ci", stdout: new CaptureStream(), stderr, verbose: true }).log.debug("shown");
    expect(stderr.text).toContain("shown");
  });

  test("errors: message, details and hint in text modes", () => {
    const { reporter, stderr } = setup("ci");
    reporter.error(new UsageError("Bad flag", { hint: "Try --help", details: ["line one"] }));
    expect(stderr.text).toContain("✖ Bad flag");
    expect(stderr.text).toContain("line one");
    expect(stderr.text).toContain("→ Try --help");
  });

  test("errors: unexpected errors suggest --verbose", () => {
    const { reporter, stderr } = setup("ci");
    reporter.error(new Error("boom"));
    expect(stderr.text).toContain("Unexpected error: boom");
    expect(stderr.text).toContain("--verbose");
  });

  test("errors: json envelope on stdout", () => {
    const { reporter, stdout } = setup("json", false);
    reporter.error(new BtkError("Nope", { code: "ERR_NOPE", hint: "fix it" }));
    expect(JSON.parse(stdout.text)).toEqual({
      ok: false,
      error: { code: "ERR_NOPE", message: "Nope", hint: "fix it" },
    });
  });

  test("stopping a progress bar clears its line and restores the cursor", () => {
    const { reporter, stderr } = setup("human");
    reporter.progress.start(10, "files");
    reporter.progress.tick();
    reporter.progress.stop();
    expect(stderr.text.endsWith("\r\x1b[2K\x1b[?25h")).toBe(true);
  });

  test("animated spinner redraws one line and restores the cursor", () => {
    const { reporter, stderr } = setup("human");
    reporter.spinner.start("loading");
    reporter.spinner.succeed("loaded");
    expect(stderr.text).toContain("\x1b[?25l");
    expect(stderr.text).toContain("\x1b[?25h");
    expect(stderr.text).toContain("loaded");
  });
});
