# btk md

Preview markdown in the browser or in the terminal, serve a whole folder of it, and render it to HTML. It uses `Bun.markdown`, a CommonMark and GFM parser written in Rust, so tables, task lists, strikethrough and autolinks work out of the box.

## Commands

| Command | What it does |
| --- | --- |
| `btk md [file]` | Live preview in the browser, or in the terminal when the output is piped. Short for `btk md preview` |
| `btk md serve [folder]` | Serve every markdown file in a folder, with a sidebar and live reload |
| `btk md html [file]` | Render a standalone HTML page, or only the body with `--fragment` |
| `btk md themes` | List the themes, including the ones plugins add |

`btk markdown` is an alias for `btk md`. `-` or a pipe reads standard input.

### preview

```bash
btk md README.md                        # opens a live page in the browser
btk md README.md --terminal             # styled output in the terminal
btk md CHANGELOG.md | head              # piped output gets the terminal rendering, plain
btk md CHANGELOG.md --terminal | less -R # styled, through a pager
btk md docs/guide.md --theme plain --no-open
btk md README.md --port 4000 --no-open  # a fixed URL; open it yourself
btk md README.md --css docs/preview.css # your stylesheet on top of the theme
cat notes.md | btk md --browser         # piped markdown, still in the browser
btk md README.md --terminal --columns 72 --hyperlinks
```

In a terminal, `btk md README.md` serves the page on `127.0.0.1` and opens your browser. The server only answers requests for `127.0.0.1` and `localhost`. The page updates when you save the file and keeps its scroll position. Images and other files next to the markdown file are served too, so relative links work. Press Ctrl+C to stop.

When stdout is not a terminal, or in json mode, preview prints the terminal rendering instead, because nobody is there to look at a browser. `--terminal` and `--browser` force one or the other. Piped output is plain unless you pass `--terminal`, which keeps the colors for a pager such as `less -R`.

| Option | Config key | Default | What it does |
| --- | --- | --- | --- |
| `--theme`, `-t` | `theme` | `btk` | Theme for both the terminal and the page |
| `--terminal` | | | Print to the terminal |
| `--browser` | | | Serve the page even when output is piped |
| `--no-open` | `open` | `true` | Print the URL without opening a browser |
| `--port`, `-p` | `port` | `0` | Server port; `0` picks a free one |
| `--columns` | `columns` | terminal width, up to 100 | Wrap width for the terminal |
| `--hyperlinks` | `hyperlinks` | `false` | Clickable links (OSC 8) in terminals that support them |
| `--css` | `css` | | Extra stylesheet added after the theme's, relative to the working directory |

Front matter, the YAML block between `---` lines that Jekyll, Hugo and VitePress put at the top of a file, is left out of every output. Its `title` becomes the page title and the sidebar label in `btk md serve`, ahead of the first heading.

In the terminal, code blocks in JavaScript and TypeScript get syntax highlighting from Bun's own highlighter, recolored by the theme. Other languages show as plain text in a frame.

### serve

```bash
btk md serve                            # every markdown file under the current folder
btk md serve docs                       # just docs/
btk md docs/                            # the same: preview serves a folder it is given
btk md serve docs --port 4000 --no-open --theme plain
```

`btk md serve` previews a folder of docs the way readers will move through them. Every page gets a sidebar that lists all the markdown files, grouped by folder, with the current page marked. Saving any page, or a stylesheet, reloads the open pages, and new files show up in the sidebar.

- **URLs follow the files.** `docs/tools/hash.md` is at `/tools/hash.md`, so relative links such as `tools/hash.md`, `../README.md` or `config.md#environment-variables` work exactly as they do on GitHub.
- **Folders open their index.** `/` and every folder show `README.md` (or `readme.md`, or `index.md`) when the folder has one, and a list of the pages under it when it doesn't.
- **It skips what isn't docs.** `node_modules` and dot folders such as `.git` and `.github` stay out of the sidebar.
- **Images and other files** in the folder are served as they are. Nothing outside the folder is reachable, including through symlinks, and neither are dotfiles such as `.env`.

It takes `--theme`, `--css`, `--port` and `--no-open`, with the same config keys as preview. Press Ctrl+C to stop. In json mode it prints `{ mode, root, pages, theme, url }` when it stops.

`btk md serve` is a preview, not a site generator: it renders each page when you open it and writes nothing to disk. To serve a folder of HTML or other files as they are, use [`btk serve`](serve.md).

### html

```bash
btk md html README.md > README.html
btk md html notes.md --fragment         # just the rendered body
btk md html notes.md --css print.css > notes.html
```

The page is self-contained: the theme's styles are inlined, and it has no live reload script. Headings get `id` attributes for links. GFM's tag filter turns dangerous raw HTML such as `<script>` and `<iframe>` into text.

### themes

```bash
btk md themes
btk md themes --json | jq -r '.data[].name'
```

## Themes

A theme styles both outputs:

- `terminal` sets a style per element (color, background, bold, italic, underline, dim, strikethrough) and the characters btk draws: bullets, task markers, heading prefixes, the quote bar, rules and box corners.
- `css` is the stylesheet for the browser page and `btk md html`.

Two themes are built in:

| Theme | Look |
| --- | --- |
| `btk` | The default. Bun pink headings, links and bullets; light and dark pages |
| `plain` | No colors and ASCII characters in the terminal, a serif page. Good for piping and printing |

Pick one with `--theme`, `tools.md.theme` or `BTK_MD_THEME`. Plugins add more; see [Writing a theme](../plugins.md#writing-a-theme).

With `NO_COLOR`, `--no-color` or `CI` set, every style turns off, and the theme's characters still apply.

## Styling the page

To restyle the browser page without writing a theme, pass a stylesheet with `--css` or set `tools.md.css`. btk adds it after the theme's styles, so your rules win.

The `btk` theme reads its colors from CSS variables, so a few lines recolor the whole page:

```css
/* docs/preview.css */
:root {
  --accent: #7c3aed;
  --code-bg: #f5f3ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1b2e;
    --code-bg: #2a2540;
  }
}
main { max-width: 1040px; }
```

```bash
btk md README.md --css docs/preview.css
btk md html README.md --css docs/preview.css > README.html
```

| Variable | Used for |
| --- | --- |
| `--accent` | Level 1 and 2 headings, links, the quote bar, checkboxes |
| `--bg`, `--fg` | Page background and text |
| `--muted` | Quotes, comments and punctuation in code |
| `--border` | Heading underlines, tables, rules, code block borders |
| `--code-bg` | Code blocks, inline code, striped table rows |
| `--keyword`, `--type`, `--string`, `--literal` | Syntax highlighting |

`--accent` is the same in light and dark. The others have a dark value too, so set them inside `@media (prefers-color-scheme: dark)` to change the dark page.

You can also target elements directly. The markdown sits in `<main>`, and `btk md serve` puts a `<nav class="btk-nav">` sidebar next to it. Highlighted code uses `tok-keyword`, `tok-type`, `tok-string`, `tok-literal`, `tok-comment` and `tok-punctuation` spans, and task list items have the `task-list-item` class:

```css
h1 { font-size: 2.5em; border-bottom: none; }
.tok-comment { font-style: normal; }
.task-list-item { opacity: 0.8; }
```

`--css` styles the page only. To change the terminal output, or to share a look across projects under a name, write a theme; see [Writing a theme](../plugins.md#writing-a-theme).

## Config

```ts
// btk.config.ts
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  tools: {
    md: { theme: "plain", port: 4321, open: false, columns: 80, css: "docs/preview.css" },
  },
});
```

Every key also works as an environment variable, such as `BTK_MD_THEME=plain` or `BTK_MD_PORT=4321`.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Rendered, or the preview stopped with Ctrl+C |
| 1 | The file or stylesheet is missing, a served folder has no markdown, a plugin failed, or the port is taken |
| 2 | An unknown theme, conflicting flags, no input, or a folder where a file is expected (and the reverse) |
