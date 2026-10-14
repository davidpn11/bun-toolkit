# Plugin system

Plugins change bun-toolkit's behavior through hooks. The first hooks belong to `btk md`, so a plugin can add themes for the markdown preview or replace its HTML page.

Plugins load only from the config file. You can't install them globally, and btk never discovers them on its own, so a project's behavior depends only on its config. JSON configs can't hold plugins, because plugins are functions.

## How it works

```typescript
type BtkPlugin = {
  name: string;
  setup(hooks: HookRegistry): void;
};

type HookRegistry = {
  on<T extends HookName>(name: T, handler: HookHandler<T>): void;
};
```

A plugin package exports a function that returns a `BtkPlugin`, and the config calls it:

```typescript
// btk.config.ts
import { defineConfig } from "bun-toolkit";
import githubMarkdown from "btk-plugin-github-md";

export default defineConfig({
  plugins: [githubMarkdown()],
});
```

The first time a command asks for a hook, btk calls every plugin's `setup()` in config order, global plugins before project ones. Each plugin registers handlers with `hooks.on()`. Commands that use no hooks never run `setup()`, so a broken plugin only breaks the commands that use plugins.

If `setup()` or a handler throws, the command fails with the plugin's name in the message. A plugin listed twice runs twice, with a warning.

## Hooks

Each hook has a kind:

- **collect** hooks gather the result of every handler, so several plugins can contribute.
- **replace** hooks use the last handler's result, so a later plugin wins over an earlier one.

| Hook | Kind | Receives | Returns | Purpose |
| --- | --- | --- | --- | --- |
| `md:theme` | collect | nothing | `MdTheme` or `MdTheme[]` | Add themes for `btk md` |
| `md:html:template` | replace | `{ title, body, css, liveReload, nav }` | HTML string | Replace the page around the rendered markdown |

Hooks are synchronous. Plugins run in the same process as bun-toolkit and can use every Bun API.

### Future hooks

| Hook | Purpose |
| --- | --- |
| `image:post-process` | Run custom transforms after optimization |
| `convert:format` | Register custom format parsers |
| `output:format` | Custom output renderers |
| `command:before`, `command:after` | Run code around any command |

## Writing a theme

```typescript
// btk-plugin-ocean/index.ts
import { definePlugin, defineTheme } from "bun-toolkit";

const ocean = defineTheme({
  name: "ocean",
  description: "Deep blue headings and links",
  extends: "btk",
  terminal: {
    heading: [{ color: "#3b82f6", bold: true }, { color: "#60a5fa", bold: true }, { bold: true }],
    link: { color: "cyan", underline: true },
    list: { bullet: { color: "#3b82f6" } },
    glyphs: { bullets: ["▸", "▹"], box: "square" },
  },
  css: `
    :root { --accent: #3b82f6; }
  `,
});

export default definePlugin(() => ({
  name: "ocean",
  setup(hooks) {
    hooks.on("md:theme", () => ocean);
  },
}));
```

Users then run `btk md README.md --theme ocean`, or set `tools.md.theme: "ocean"`. `btk md themes` lists it with the plugin that provided it.

`definePlugin` and `defineTheme` only add types. btk validates every theme a plugin hands over and reports bad keys or colors with the theme and plugin name.

### Rules

- **Name:** lowercase letters, digits and dashes. A plugin theme with the name of an existing theme replaces it.
- **Terminal styles:** fill in from the theme named in `extends`, or from `btk` without one. A style such as `link` is replaced whole. The grouped sections (`codeBlock`, `table`, `list`, `syntax`, `glyphs`) merge key by key.
- **css:** with `extends`, it is added after the base theme's stylesheet, so a few overrides are enough. Without `extends`, it replaces btk's stylesheet. A theme with no `css` uses btk's.
- **Colors:** `#rrggbb`, or a terminal color name: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, or a `…Bright` variant such as `cyanBright`.

### Terminal keys

Every style is `{ color?, bg?, bold?, dim?, italic?, underline?, strikethrough? }`.

| Key | Styles |
| --- | --- |
| `heading` | One style per level, starting at 1; the last repeats for deeper levels |
| `headingRule` | The line under level 1 headings |
| `strong`, `emphasis`, `strikethrough`, `codespan` | Inline text |
| `link`, `url`, `image` | Link text, the `(url)` after it, image alt text |
| `blockquote` | The quote bar |
| `rule`, `html` | Horizontal rules, raw HTML blocks |
| `codeBlock` | `border`, `language`, `text` |
| `table` | `border`, `header` |
| `list` | `bullet`, `number`, `taskDone`, `taskTodo` |
| `syntax` | `keyword`, `type`, `string`, `literal`, `comment`, `punctuation` |
| `glyphs` | `bullets` (per depth), `heading` (prefix per level), `taskDone`, `taskTodo`, `quote`, `rule` (one character, or `""` for no heading underline), `box` (`rounded`, `square` or `ascii`) |

### Page classes

The page wraps the markdown in `<main>`. Under `btk md serve`, a `<div class="btk-site">` holds a `<nav class="btk-nav">` sidebar next to it, and folder names in the sidebar use `btk-nav-folder`. Highlighted code uses `tok-keyword`, `tok-type`, `tok-string`, `tok-literal`, `tok-comment` and `tok-punctuation` spans, and task list items have the `task-list-item` class. btk's stylesheet reads its colors from CSS variables such as `--accent`, `--bg`, `--fg`, `--muted`, `--border` and `--code-bg`, so a theme that extends `btk` can recolor the page by setting them.

## Replacing the page

```typescript
hooks.on("md:html:template", ({ title, body, css, liveReload, nav }) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head>
<body>${nav ? `<aside>${nav}</aside>` : ""}<article>${body}</article>${liveReload}</body>
</html>`);
```

`title` comes from the first level 1 heading, or the file name. `css` is the theme's stylesheet plus `tools.md.css`. Keep `${liveReload}` in the page so the browser preview reloads on save. It is empty for `btk md html`. `nav` is the sidebar for `btk md serve`: a nested `<ul>` of links, with `aria-current="page"` on the current one. It is empty for a single file.

## Implementation notes

- `src/plugins/types.ts` holds `HookMap`, the single list of hooks with what each receives and returns.
- `src/plugins/loader.ts` builds `ctx.hooks` from `config.plugins`: `collect(name, input)` for collect hooks and `last(name, input)` for replace hooks.
- The `bun-toolkit` module that config files and plugins import at runtime comes from `src/config/virtual-module.ts`, which exports `defineConfig`, `definePlugin` and `defineTheme`. This is how plugins work in the compiled binary, which has no `node_modules` of its own.
