import { describe, expect, test } from "bun:test";
import { testRegistry } from "../../tests/support/fake-tool.ts";
import { UsageError } from "../errors.ts";
import { resolveRoute } from "./router.ts";

const registry = testRegistry();
const route = (...argv: string[]) => resolveRoute(argv, registry);

describe("resolveRoute()", () => {
  test("no command -> root help; --version -> version", () => {
    expect(route().kind).toBe("root-help");
    expect(route("--help").kind).toBe("root-help");
    expect(route("--version").kind).toBe("version");
    expect(route("--json").kind).toBe("root-help");
  });

  test("leaf commands keep global flags from before the name", () => {
    expect(route("--json", "info", "--verbose")).toMatchObject({
      kind: "action",
      path: "info",
      tokens: ["--json", "--verbose"],
    });
    expect(route("--config", "x.ts", "info")).toMatchObject({ path: "info", tokens: ["--config", "x.ts"] });
  });

  test("tool actions, aliases and the default action", () => {
    expect(route("demo", "fail")).toMatchObject({ kind: "action", path: "demo fail" });
    expect(route("dm", "fail")).toMatchObject({ kind: "action", path: "demo fail" });
    expect(route("demo", "a.txt", "-l", "3")).toMatchObject({
      path: "demo process",
      tokens: ["a.txt", "-l", "3"],
    });
    expect(route("demo", "--level", "3")).toMatchObject({ path: "demo process" });
    expect(route("config")).toMatchObject({ path: "config show" });
    expect(route("config", "--json", "validate")).toMatchObject({
      path: "config validate",
      tokens: ["--json"],
    });
    expect(route("demo", "--config", "x.ts", "fail")).toMatchObject({ path: "demo fail" });
  });

  test("tool help and tool ui", () => {
    expect(route("demo")).toMatchObject({ kind: "action", path: "demo process" });
    expect(route("demo", "--help").kind).toBe("tool-help");
    expect(route("demo", "--ui").kind).toBe("tool-ui");
    expect(route("demo", "process", "--help")).toMatchObject({ kind: "action", path: "demo process" });
  });

  test("unknown commands suggest the closest one", () => {
    try {
      route("ifno");
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).message).toBe('Unknown command "ifno"');
      expect((error as UsageError).hint).toBe('Did you mean "btk info"?');
    }
  });

  test("non-global options before the command are rejected", () => {
    expect(() => route("--quality", "5", "info")).toThrow("Unknown option --quality");
  });
});
