# Plugin system

## Overview

Plugins extend bun-toolkit's behavior through hooks. Introduced in Phase 6 alongside the markdown renderer, which is the first tool that benefits from customization beyond config values.

Plugins only load from the config file. They cannot be installed globally or discovered automatically. This keeps behavior predictable.

## Plugin interface

```typescript
type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

type HookRegistry = {
  on<T extends HookName>(name: T, handler: HookHandler<T>): void;
};
```

A plugin is a function that returns a `BtkPlugin` object. The `setup` method receives a hook registry and registers handlers.

## Writing a plugin

```typescript
// btk-plugin-github-md/index.ts
import type { BtkPlugin } from "bun-toolkit";

export default function githubMarkdown(): BtkPlugin {
  return {
    name: "github-markdown",
    setup(hooks) {
      hooks.on("md:preview:theme", () => githubAnsiTheme);
      hooks.on("md:html:template", () => githubHtmlTemplate);
    },
  };
}
```

## Registering plugins

Plugins are registered in `btk.config.ts`:

```typescript
import { defineConfig } from "bun-toolkit";
import githubMarkdown from "btk-plugin-github-md";

export default defineConfig({
  plugins: [githubMarkdown()],
});
```

## Available hooks

The hook set starts narrow and expands as tools need it.

### Phase 6 hooks (markdown)

| Hook | Arguments | Return | Purpose |
|------|-----------|--------|---------|
| `md:preview:theme` | `{ content: string }` | ANSI theme object | Custom terminal preview styling |
| `md:html:template` | `{ content: string, html: string }` | HTML string | Custom HTML wrapper/template |

### Future hooks

| Hook | Phase | Purpose |
|------|-------|---------|
| `image:post-process` | Phase 1+ | Run custom transforms after optimization |
| `convert:format` | Phase 3+ | Register custom format parsers |
| `output:format` | Any | Custom output renderers |
| `command:before` | Any | Pre-processing before any command |
| `command:after` | Any | Post-processing after any command |

## Implementation notes

- `src/plugins/types.ts` defines the `BtkPlugin` and `HookRegistry` interfaces.
- `src/plugins/loader.ts` iterates over `config.plugins`, calls `setup()` on each, and builds a resolved hook map.
- Hooks are synchronous by default. Async hooks (like `image:post-process`) return promises and are awaited.
- If multiple plugins register the same hook, they execute in registration order. The last return value wins for hooks that return a replacement (like `md:html:template`).
- Plugins run in the same process as bun-toolkit. They have full access to Bun APIs.
