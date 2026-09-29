import { describe, expect, test } from "bun:test";
import { detectEnvironment, type EnvironmentInput } from "./env.ts";

const tty: EnvironmentInput = { argv: [], env: {}, stdinIsTTY: true, stdoutIsTTY: true, stderrIsTTY: true };
const detect = (patch: Partial<EnvironmentInput> = {}, prefs = {}) =>
  detectEnvironment({ ...tty, ...patch }, prefs);

describe("detectEnvironment()", () => {
  test("interactive terminal -> human, colored, interactive", () => {
    expect(detect()).toMatchObject({ mode: "human", color: true, interactive: true });
  });

  test("json wins over everything", () => {
    expect(detect({ argv: ["info", "--json"], env: { CI: "true" } }).mode).toBe("json");
    expect(detect({ env: { BTK_OUTPUT: "json" } }).mode).toBe("json");
    expect(detect({ env: { AGENT: "true" } }).mode).toBe("json");
    expect(detect({}, { json: true }).mode).toBe("json");
  });

  test("flags after -- are not options", () => {
    expect(detect({ argv: ["info", "--", "--json"] }).mode).toBe("human");
  });

  test("CI, NO_COLOR, --no-color, dumb terminals and piped stderr -> ci", () => {
    expect(detect({ env: { CI: "true" } }).mode).toBe("ci");
    expect(detect({ env: { CI: "1" } }).mode).toBe("ci");
    expect(detect({ env: { NO_COLOR: "1" } }).mode).toBe("ci");
    expect(detect({ argv: ["--no-color"] }).mode).toBe("ci");
    expect(detect({ env: { TERM: "dumb" } }).mode).toBe("ci");
    expect(detect({ stderrIsTTY: false }).mode).toBe("ci");
    expect(detect({}, { color: false }).mode).toBe("ci");
  });

  test("CI=false does not count as CI", () => {
    expect(detect({ env: { CI: "false" } }).mode).toBe("human");
  });

  test("ci mode is never colored or interactive", () => {
    expect(detect({ env: { CI: "true" } })).toMatchObject({ color: false, interactive: false });
  });

  test("human mode with piped stdin is not interactive", () => {
    expect(detect({ stdinIsTTY: false })).toMatchObject({ mode: "human", interactive: false });
  });

  test("verbose from flag, env or config", () => {
    expect(detect({ argv: ["--verbose"] }).verbose).toBe(true);
    expect(detect({ env: { BTK_VERBOSE: "true" } }).verbose).toBe(true);
    expect(detect({}, { verbose: true }).verbose).toBe(true);
    expect(detect().verbose).toBe(false);
  });

  test("records why the mode was chosen", () => {
    expect(detect({ env: { CI: "true" } }).reason).toBe("CI=true");
  });
});
