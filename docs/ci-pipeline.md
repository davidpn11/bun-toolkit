# CI pipeline

The plan has four GitHub Actions workflows. None of them exist yet; they arrive with the first release.

## test.yml (on pull request)

Runs on every pull request.

Steps:
1. Checkout
2. Setup Bun (`oven-sh/setup-bun@v2`)
3. `bun install --frozen-lockfile`
4. Typecheck (`tsc --noEmit`)
5. Lint (`oxlint`)
6. Format check (`biome check` or `oxfmt --check`)
7. `bun test` (unit + integration against source)
8. Build for current platform
9. `bun run test:dist` (integration against compiled binary)

## release.yml (on tag push `v*`)

Pushing a version tag starts it. It builds, tests and publishes everything.

### Job 1: checks
- Full test suite (same as test.yml steps 1-7)

### Job 2: build-matrix (depends on checks)
- Matrix strategy, one job per platform:
  - `darwin-arm64` on `macos-latest`
  - `darwin-x64` on `macos-13` (or cross-compiled)
  - `linux-x64` on `ubuntu-latest`
  - `linux-arm64` cross-compiled on `ubuntu-latest`
  - `windows-x64` on `windows-latest`
- Each job:
  1. Checkout + setup Bun
  2. `bun scripts/build.ts --target bun-{target} --outfile dist/btk`
  3. Run `test:dist` on platforms that can execute natively
  4. Upload binary as artifact

### Job 3: package (depends on build-matrix)
- Downloads all binary artifacts
- Runs `scripts/package-npm.ts` to generate:
  - Main package (`bun-toolkit`) with `bin.mjs` shim
  - Platform packages (`@btk/darwin-arm64`, etc.) each with one binary
- Uploads all packages as artifacts

### Job 4: publish-npm (depends on package)
- `npm publish` for the main package
- `npm publish` for each platform package
- Uses `NPM_TOKEN` secret

### Job 5: publish-github (depends on build-matrix)
- Creates GitHub Release from the tag
- Attaches all binaries to the release
- Auto-generates release notes from commits

### Job 6: trigger-homebrew (depends on publish-github)
- Dispatches the `homebrew.yml` workflow with version and release URL

## homebrew.yml (triggered by release.yml)

Updates the Homebrew tap.

Steps:
1. Download release binaries (or compute URLs from the release)
2. Compute SHA256 for each binary
3. Run `scripts/update-homebrew.ts` to generate/update the formula
4. Open a PR to `homebrew-bun-toolkit` tap repository
5. Auto-merge if tests pass

## nightly.yml (scheduled, optional)

Runs on a schedule, such as daily at 03:00 UTC, against Bun canary so a breaking Bun change shows up before a release.

Steps:
1. Checkout
2. Setup Bun canary (`oven-sh/setup-bun@v2` with `bun-version: canary`)
3. `bun install`
4. `bun test`
5. Build for current platform
6. `bun run test:dist`
7. If any step fails, open an issue or notify

## Required secrets

| Secret | Used in | Purpose |
|--------|---------|---------|
| `NPM_TOKEN` | release.yml | Publishing to npm |
| `HOMEBREW_TAP_TOKEN` | homebrew.yml | Opening PRs to the tap repo |

## Build flags

Every compiled binary goes through `scripts/build.ts`:

```typescript
await Bun.build({
  entrypoints: ["./bin/btk.ts"],
  compile: { outfile, target },
  minify: true,
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [stubDevtools],   // Ink's dev-only react-devtools-core import
});
```

The build skips `--bytecode` because Ink and yoga-layout use top-level await, which bytecode compilation rejects (see docs/distribution.md). The entrypoint still avoids top-level await, so we can turn bytecode back on if that changes.
