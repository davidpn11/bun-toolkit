# ADR-011: Mermaid diagrams as a plugin

- **Status:** Proposed
- **Builds on:** [ADR-009](ADR-009-plugins-from-config.md), [ADR-010](ADR-010-local-server-boundaries.md)

`btk md` shows a ` ```mermaid ` block as highlighted code. Rendering the diagram, including newer types such as `xychart-beta`, needs Mermaid's browser script, which is about 5.5 MB (1.6 MB gzipped). Bundled into btk, that would add 5–7% to every binary (77 MB to about 82.6 MB on macOS arm64) for one feature of one tool. As a plugin, only the people who want diagrams download it.

## How it will be used

```bash
bun add -d @bun-toolkit/plugin-mermaid
```

```typescript
// btk.config.ts
import { defineConfig } from "bun-toolkit";
import mermaid from "@bun-toolkit/plugin-mermaid";

export default defineConfig({
  plugins: [mermaid()],
});
```

After that, `btk md preview`, `btk md serve`, `btk md build` and `btk md html` render every ` ```mermaid ` block as a diagram. Diagrams follow the page's light or dark scheme and redraw on live reload. The terminal preview keeps showing the block's source, because a terminal can't draw the diagram.

## What btk needs first

Today's hooks can add a theme or replace the whole page. They can't change how one code block renders, add a script the page's Content-Security-Policy allows, or serve a file. These changes go into btk itself, as one minor release, before the plugin can exist.

### 1. `md:code-block` hook

| Kind | Receives | Returns |
| --- | --- | --- |
| replace | `{ language, code }` | an HTML string, or `undefined` to keep the built-in highlighting |

`renderBody` in `src/tools/md/html/page.ts` takes `hooks` and asks this hook for every fenced block, before `highlight()`. The last plugin that returns a string wins. `md html --fragment` in `src/tools/md/tool.ts` passes `ctx.hooks` too.

### 2. `md:html:assets` hook

| Kind | Receives | Returns |
| --- | --- | --- |
| collect | `{ body }`, the rendered HTML | `{ files?, scripts? }` |

```typescript
type PageAssets = {
  /** Name to absolute path, served or copied next to the page. */
  files?: Record<string, string>;
  scripts?: ({ src: string } | { code: string })[];
};
```

The plugin returns nothing when `body` has no diagram, so other pages stay as they are. btk then does the following:

- **Preview and serve.** btk serves `files` at `/__btk/plugins/<plugin>/<name>` from the shared server in `src/shared/serve.ts`. A `{ src }` script points there.
- **`md build`.** btk copies `files` to `<out>/_btk/<plugin>/<name>`, and the links stay relative like every other link in the build.
- **`md html`.** The page must stay one standalone file, so btk inlines each file's contents into its `<script>`. The page grows by the script's size.
- **CSP.** btk adds every script to the page's `script-src`: `'self'` for files served by btk, and a `sha256-…` hash for each inline script. The hash is computed the same way as for the live reload script.

### 3. A reload event

The live reload script replaces `document.body`, which throws away diagrams that were already drawn. After the swap, it dispatches `btk:reload` on `document`, so plugin scripts can draw again.

### 4. Types

`src/public.ts` exports the new input and output types, `PageAssets` and `CodeBlockInput`, so a plugin gets autocomplete from `"bun-toolkit"`.

## The package

A Bun workspace in this repository: `packages/plugin-mermaid`, with `"workspaces": ["packages/*"]` in the root `package.json`.

```
packages/plugin-mermaid/
  package.json        @bun-toolkit/plugin-mermaid; depends on mermaid (pinned); bun-toolkit as a dev dependency for types
  index.ts
  index.test.ts
  README.md
```

```typescript
import { definePlugin } from "bun-toolkit";

const script = Bun.fileURLToPath(import.meta.resolve("mermaid/dist/mermaid.min.js"));

const start = `
const draw = () => mermaid.run();
mermaid.initialize({
  startOnLoad: false,
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
});
draw();
document.addEventListener("btk:reload", draw);
`;

export default definePlugin(() => ({
  name: "mermaid",
  setup(hooks) {
    hooks.on("md:code-block", ({ language, code }) =>
      language === "mermaid" ? `<pre class="mermaid">${Bun.escapeHTML(code)}</pre>` : undefined,
    );
    hooks.on("md:html:assets", ({ body }) =>
      body.includes('<pre class="mermaid">')
        ? { files: { "mermaid.min.js": script }, scripts: [{ src: "mermaid.min.js" }, { code: start }] }
        : {},
    );
  },
}));
```

- **Mermaid version.** The package pins one exact version, at least two weeks old, that renders `xychart-beta`. Upgrading Mermaid means releasing the plugin, not btk.
- **Resolving the file.** `import.meta.resolve` finds Mermaid in the plugin's own `node_modules`. This must also work when the compiled binary loads the plugin from a project, and the tests check that.

## Publishing

This is the first npm package, so it also starts the npm channel planned in [distribution.md](../distribution.md) and [ADR-007](ADR-007-homebrew-before-npm.md):

- **Name.** `@bun-toolkit/plugin-mermaid`, in the `bun-toolkit` npm org.
- **Versions.** Changesets already versions the root package. With a workspace, it versions both, and one changeset can name either package. `scripts/release-check.ts`, `scripts/version-packages.ts` and `publish.yml` assume one package, so they need to ignore the plugin or handle it.
- **Workflow.** A `plugin-publish.yml` job runs `npm publish --provenance` when the plugin's version changes on master. It uses npm trusted publishing rather than an `NPM_TOKEN` secret.

## Tests

Core tests, in `src/tools/md/md.test.ts` and `src/shared/serve.test.ts`:

- a `md:code-block` handler replaces one language and leaves others highlighted;
- `md:html:assets` adds script tags and the matching CSP entries, and adds nothing when the hook returns nothing;
- preview serves a plugin file under `/__btk/plugins/…`;
- `md build` copies it, and `md html` inlines it;
- live reload dispatches `btk:reload`.

Plugin tests, in `packages/plugin-mermaid/index.test.ts`:

- a page with an `xychart-beta` block gets `<pre class="mermaid">`, the script and the CSP entries;
- a page without one gets neither.

In a browser:

- `btk md` on a file with an `xychart-beta` chart and a flowchart draws two SVGs;
- they redraw after an edit;
- the console shows no CSP violations;
- the same holds for the `md build` output opened from disk.

## Order of work

1. The core hooks, the reload event and the docs (`plugins.md` hook table, a "Diagrams" note in `tools/md.md`), released as a btk minor version.
2. The workspace and the plugin, with its tests, using the released hooks.
3. The npm publishing workflow, then the first plugin release.

## Open questions

- **`md html`.** Should it inline the whole 5.5 MB script, or link a pinned CDN copy with an integrity hash and accept that the page needs the internet?
- **A hint without the plugin.** When the plugin isn't installed, should btk print a one-line hint the first time a page has a ` ```mermaid ` block?
- **A terminal hook.** Is a `md:terminal:code-block` hook worth adding later, for plugins that draw text diagrams?
