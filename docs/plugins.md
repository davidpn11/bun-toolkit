# Plugin system

Plugins change bun-toolkit's behavior through hooks. They arrive in Phase 6 with the markdown renderer, the first tool where people will want more than config values, such as their own themes and templates.

Plugins load only from the config file. You can't install them globally, and btk never discovers them on its own, so a project's behavior depends only on its config.

## Plugin types

```typescript
type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

type HookRegistry = {
  on<T extends HookName>(name: T, handler: HookHandler<T>): void;
};
```

A plugin is a function that returns a `BtkPlugin`. btk calls its `setup` method with a hook registry, and the plugin registers its handlers there.

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

Add plugins in `btk.config.ts`:

```typescript
import { defineConfig } from "bun-toolkit";
import githubMarkdown from "btk-plugin-github-md";

export default defineConfig({
  plugins: [githubMarkdown()],
});
```

## Available hooks

The first release has few hooks, and more arrive as tools need them.

### Phase 6 hooks for markdown

| Hook | Arguments | Return | Purpose |
|------|-----------|--------|---------|
| `md:preview:theme` | `{ content: string }` | ANSI theme object | Custom styling for the terminal preview |
| `md:html:template` | `{ content: string, html: string }` | HTML string | Custom HTML wrapper or template |

### Future hooks

| Hook | Phase | Purpose |
|------|-------|---------|
| `image:post-process` | 1 or later | Run custom transforms after optimization |
| `convert:format` | 3 or later | Register custom format parsers |
| `output:format` | Any | Custom output renderers |
| `command:before` | Any | Run code before any command |
| `command:after` | Any | Run code after any command |

## Implementation notes

- `src/plugins/types.ts` defines the `BtkPlugin` and `HookRegistry` types.
- `src/plugins/loader.ts` will call `setup()` on each entry in `config.plugins` and build a map of the registered hooks.
- Hooks are synchronous by default. Async hooks, such as `image:post-process`, return promises that btk awaits.
- When several plugins register the same hook, btk runs them in registration order. For hooks that return a replacement, such as `md:html:template`, the last return value wins.
- Plugins run in the same process as bun-toolkit and can use every Bun API.
