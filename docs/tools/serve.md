# btk serve

Serve a folder over HTTP with `Bun.serve`, and reload the browser when a file changes. It works on any folder: a built site in `dist/`, a page you're sketching, test fixtures, a folder of images.

## Commands

| Command | What it does |
| --- | --- |
| `btk serve [path]` | Serve a folder (the current one by default), or a file's folder with that file opened. Short for `btk serve run` |

```bash
btk serve                               # the current folder
btk serve dist --spa                    # a single-page app: unknown routes get index.html
btk serve demo/page.html                # serve demo/ and open page.html
btk serve public --port 8080 --no-open
btk serve site --host 0.0.0.0           # also reachable from your phone on the same network
btk serve fixtures --cors               # let pages on other origins fetch these files
```

## What it does

- **A file opens itself.** `btk serve demo/page.html` serves the `demo/` folder and opens `page.html`, so its relative links, scripts and styles load, and saving it reloads the page.
- **Folders open their `index.html`.** A folder without one shows a listing with folders first and file sizes. `/docs` redirects to `/docs/`, keeping any query string, so relative links inside the folder resolve.
- **Files go out as they are,** with the content type `Bun.file` picks from the extension. Nothing is bundled or transformed.
- **Live reload.** btk adds a small script to every HTML page it serves, before `</body>`. When any file in the folder changes, open pages reload. Changes in `node_modules` and dot folders don't count.
- **Single-page apps.** With `--spa`, a path that has no file extension and matches no file, such as `/settings/profile`, gets the root `index.html`, so client-side routing works on reload. Missing assets such as `/logo.png` still return 404.
- **Fresh files.** Every response has `Cache-Control: no-cache`, so a reload never shows a stale copy.
- **Resumable downloads.** Files carry a `Last-Modified` header and answer range requests, so a large download that stops halfway picks up where it left off, and video and audio can seek. If the file changed in the meantime, the client gets the whole new file instead.
- **When watching fails,** for example when a very large folder runs into the operating system's watch limit, btk warns and keeps serving. Reload the page yourself.

Press Ctrl+C to stop. With `--json` it prints `{ root, url, host, port, network }` when it stops. Json mode from `AGENT=true`, `BTK_OUTPUT=json` or config is refused with `ERR_SERVER_JSON`, so an agent never waits on a server that only stops with Ctrl+C.

## Options

| Option | Config key | Default | What it does |
| --- | --- | --- | --- |
| `--port`, `-p` | `port` | `0` | Port; `0` picks a free one |
| `--host` | `host` | `127.0.0.1` | Address to listen on |
| `--no-open` | `open` | `true` | Print the URL without opening a browser |
| `--spa` | `spa` | `false` | Answer unknown routes with the root `index.html` |
| `--cors` | `cors` | `false` | Add `Access-Control-Allow-Origin: *` to every response |

```ts
// btk.config.ts
import { defineConfig } from "bun-toolkit";

export default defineConfig({
  tools: {
    serve: { port: 4000, spa: true, open: false },
  },
});
```

Every key also works as an environment variable, such as `BTK_SERVE_PORT=4000` or `BTK_SERVE_SPA=true`.

## Dashboard

`btk serve --ui`, or **serve** on the `btk ui` home screen, serves the current folder with your `tools.serve` settings. It shows the URL, the options, the network URLs when `host` shares it, and the latest requests with their status codes. `o` opens the browser, and leaving the screen stops the server.

## Security

By default the server listens on `127.0.0.1`, so only your machine can reach it.

- **Read only.** `GET` and `HEAD` are answered; any other method gets `405`.
- **Paths stay inside the folder.** A symlink that points outside it isn't followed, and dotfiles such as `.env` and `.git/config` are never served, even by exact URL.
- **Host names are checked.** On `127.0.0.1` it only answers requests addressed to `127.0.0.1` or `localhost`. A web page you visit therefore can't point a domain name at your machine and read your files (DNS rebinding).
- **`--host 0.0.0.0` shares the folder with your network.** btk warns, lists the URLs other devices can use, and then also answers requests addressed to an IP address or your machine's name. Use it on networks you trust.

## `btk serve` or `bun ./index.html`?

Bun has its own dev server: `bun ./index.html` serves an HTML page, bundles the TypeScript, JSX and CSS it imports, and updates the page with hot module replacement.

| Use | When |
| --- | --- |
| `bun ./index.html` | You're building an app from source and want bundling and hot module replacement. It needs Bun installed |
| `btk serve` | You want to serve files as they are: a built `dist/`, plain HTML, fixtures, any folder. Folder listings, `--spa` and `--host` are built in, and it runs from the `btk` binary without Bun |

To preview markdown, use [`btk md`](md.md): `btk md serve docs` renders a folder of markdown with a sidebar.

## Exit codes

| Code | When |
| --- | --- |
| 0 | The server stopped with Ctrl+C |
| 1 | The path doesn't exist, or the port is taken |
| 2 | An option is invalid, or json mode came from `AGENT=true` instead of `--json` |
