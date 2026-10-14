import { describe, expect, test } from "bun:test";
import { CaptureStream, createIO } from "../../tests/support/streams.ts";
import { emptyDir } from "../../tests/support/tmp.ts";
import { run } from "./main.ts";

class ClosedPipe extends CaptureStream {
  override write(): boolean {
    throw Object.assign(new Error("EPIPE: broken pipe, write"), { code: "EPIPE" });
  }
}

describe("run", () => {
  test("a write into a closed pipe ends the command quietly with 0", async () => {
    const io = { ...createIO({ stdin: "# Hi" }), stdout: new ClosedPipe() };
    const code = await run(["md", "--terminal"], {
      io,
      cwd: emptyDir(),
      env: { BTK_CONFIG_DIR: "/nonexistent-btk-test-dir", BTK_NO_LOCAL_CONFIG: "off" },
    });
    expect(code).toBe(0);
    expect(io.stderr.text).toBe("");
  });
});
