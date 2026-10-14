import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatBytes } from "../../output/format.ts";
import { ACCENT } from "../../output/palette.ts";
import { EVENTS_PATH } from "../../shared/serve.ts";

type Entry = { name: string; folder: boolean; size: number };

const RELOAD_SCRIPT = `<script>new EventSource("${EVENTS_PATH}").addEventListener("reload", () => location.reload());</script>`;

const PAGE_CSS = `
:root { color-scheme: light dark; }
body { margin: 0; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
h1 { font-size: 1.3em; font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
td { padding: 6px 8px; border-bottom: 1px solid rgba(127, 127, 127, 0.2); }
td.size { text-align: right; opacity: 0.6; font-variant-numeric: tabular-nums; }
a { color: ${ACCENT}; text-decoration: none; }
a:hover { text-decoration: underline; }
`;

/** Puts the reload script before the last `</body>`, or at the end when the page has none. */
export function injectReload(html: string): string {
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at === -1 ? `${html}\n${RELOAD_SCRIPT}` : `${html.slice(0, at)}${RELOAD_SCRIPT}\n${html.slice(at)}`;
}

/** The listing for a folder without an `index.html`. Dotfiles stay hidden, as the server refuses them anyway. */
export function listingPage(dir: string, pathname: string): string {
  const rows = listEntries(dir).map((entry) => entryRow(entry, pathname));
  const up = pathname === "/" ? "" : `<tr><td><a href="../">../</a></td><td class="size"></td></tr>`;
  const empty = rows.length === 0 ? "<p>This folder is empty.</p>" : "";
  return page(`Index of ${readable(pathname)}`, `<table>${up}${rows.join("")}</table>${empty}`);
}

export function notFoundPage(pathname: string): string {
  return page("Not found", `<p>Nothing at <code>${Bun.escapeHTML(readable(pathname))}</code>.</p>`);
}

function readable(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function listEntries(dir: string): Entry[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => !dirent.name.startsWith("."))
    .map((dirent) => {
      const folder = dirent.isDirectory();
      return { name: dirent.name, folder, size: folder ? 0 : statSync(join(dir, dirent.name)).size };
    })
    .sort(
      (a, b) =>
        Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
}

function entryRow(entry: Entry, pathname: string): string {
  const name = entry.folder ? `${entry.name}/` : entry.name;
  const href = `${pathname}${encodeURIComponent(entry.name)}${entry.folder ? "/" : ""}`;
  const size = entry.folder ? "" : formatBytes(entry.size);
  return `<tr><td><a href="${href}">${Bun.escapeHTML(name)}</a></td><td class="size">${size}</td></tr>`;
}

function page(title: string, body: string): string {
  const heading = Bun.escapeHTML(title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<h1>${heading}</h1>
${body}
</main>
</body>
</html>
`;
}
