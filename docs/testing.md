# Testing

## Test runner

`bun:test` (Bun's built-in test runner). Same runner used in jet-dev-cli.

## Unit tests

Each tool's core logic is tested in `src/tools/{name}/{name}.test.ts`. Tests call the core function directly, not through the CLI:

```typescript
import { describe, test, expect } from "bun:test";
import { hash } from "./core";

describe("hash()", () => {
  test("computes sha256 of a file", async () => {
    const result = await hash({
      file: "tests/support/fixtures/sample.txt",
      algorithm: "sha256",
    });
    expect(result.hex).toBe("expected_hex_value");
  });
});
```

## Output tests

Use PassThrough streams to capture and assert on CLI output:

```typescript
import { PassThrough } from "node:stream";

function createTestReporter() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const reporter = createReporter({ stdout, stderr, mode: "human" });
  return { reporter, stdout, stderr };
}

// Assert on captured output
const output = await readStream(stdout);
expect(output).toContain("3 files optimized");
```

This is the same pattern jet-dev-cli uses in `tests/support/streams.ts`.

## Integration tests

In `tests/integration/cli.test.ts`, invoke the CLI as a subprocess and assert on stdout, stderr, and exit code:

```typescript
import { describe, test, expect } from "bun:test";

describe("btk info", () => {
  test("prints version info", async () => {
    const proc = Bun.spawn(["bun", "bin/btk.ts", "info"]);
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    expect(stdout).toContain("bun-toolkit");
  });

  test("outputs JSON when --json is passed", async () => {
    const proc = Bun.spawn(["bun", "bin/btk.ts", "info", "--json"]);
    const stdout = await new Response(proc.stdout).text();
    const data = JSON.parse(stdout);
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("platform");
  });

  test("produces no ANSI codes in CI mode", async () => {
    const proc = Bun.spawn(["bun", "bin/btk.ts", "info"], {
      env: { ...process.env, CI: "true" },
    });
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).not.toMatch(/\x1b\[/);
  });
});
```

## Production-like testing (dist tests)

`bun run test:dist` builds the binary for the current platform and runs the integration test suite against the compiled binary instead of the source entrypoint.

The script (`scripts/test-dist.ts`):
1. Runs `bun build --compile --minify --bytecode ./bin/btk.ts --outfile=dist/btk`
2. Sets `BTK_BIN=./dist/btk` in the environment
3. Runs `bun test tests/integration/dist.test.ts`

`dist.test.ts` reads `BTK_BIN` from the environment and uses that as the binary path instead of `bun bin/btk.ts`. The test assertions are identical.

This catches issues that only appear in compiled builds:
- Missing embedded assets
- Broken bytecode compilation
- CJS/ESM interop problems in bundled dependencies

The CI pipeline runs `test:dist` for each platform that the runner can execute natively.

## Test support

| File | Purpose |
|------|---------|
| `tests/support/streams.ts` | PassThrough stream helpers, `readStream()` |
| `tests/support/context.ts` | Creates a BtkContext with test defaults (mock reporter, mock config) |
| `tests/support/fixtures/` | Test images, text files, YAML/JSON/TOML samples, config files |

## Per-tool test checklist

Every tool phase must include:
- Unit tests for the core function
- Integration test that runs the CLI and asserts on output
- JSON mode test (`--json` produces valid, parseable JSON)
- CI mode test (no ANSI codes in output)
- Config test (config file values are respected, CLI flags override them)
- Help text test (`btk <tool> --help` produces useful output)

## Linting and formatting

- **oxlint**: fast Rust-based linter
- **Biome** (or oxfmt): fast Rust-based formatter
- No config ceremony. Defaults are fine.
