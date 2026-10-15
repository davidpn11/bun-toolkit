import type { Hooks, HtmlTemplateInput } from "../../../plugins/types.ts";
import { splitFrontMatter } from "../front-matter.ts";
import { type CodeLine, highlight } from "../highlight.ts";
import { PARSER_OPTIONS } from "../tree.ts";

const HTML_OPTIONS: Bun.markdown.Options = { ...PARSER_OPTIONS, headings: { ids: true }, tagFilter: true };
const CODE_BLOCK = /<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g;
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
};

const SITE_LAYOUT_CSS = `
.btk-site { display: grid; grid-template-columns: 260px minmax(0, 1fr); max-width: 1240px; margin: 0 auto; }
.btk-site > main { min-width: 0; width: 100%; }
.btk-nav { position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 48px 8px 48px 24px; font-size: 14px; }
.btk-nav ul { list-style: none; margin: 0; padding: 0; }
.btk-nav ul ul { padding-left: 8px; }
.btk-nav a { display: block; padding: 4px 10px; border-radius: 6px; color: inherit; text-decoration: none; }
.btk-nav a:hover { background: var(--code-bg, rgba(127, 127, 127, 0.12)); }
.btk-nav a[aria-current="page"] { color: var(--accent, inherit); font-weight: 600; background: var(--code-bg, rgba(127, 127, 127, 0.12)); }
.btk-nav-folder { display: block; margin: 16px 0 4px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
@media (max-width: 800px) {
  .btk-site { grid-template-columns: 1fr; }
  .btk-nav { position: static; max-height: none; padding: 24px 16px 0; }
}
`;

/** Replaces the page body when the file changes, so the scroll position stays put. */
export const LIVE_RELOAD = `<script>
new EventSource("/__btk/events").addEventListener("reload", async () => {
  const page = new DOMParser().parseFromString(await (await fetch(location.href)).text(), "text/html");
  document.title = page.title;
  document.body.innerHTML = page.body.innerHTML;
});
</script>`;

export function renderBody(source: string): string {
  return Bun.markdown
    .html(source, HTML_OPTIONS)
    .replace(
      CODE_BLOCK,
      (_, language: string, code: string) =>
        `<pre><code class="language-${language}">${codeHtml(highlight(decodeEntities(code), language))}</code></pre>`,
    );
}

export function pageTitle(body: string, fallback: string): string {
  const heading = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  const text = heading && decodeEntities(heading.replace(/<[^>]+>/g, "")).trim();
  return text || fallback;
}

export type PageOptions = {
  css: string;
  fallbackTitle: string;
  liveReload: string;
  nav: string;
};

/** The page title is the front matter `title`, then the first level 1 heading, then `fallbackTitle`. */
export function buildPage(source: string, options: PageOptions, hooks: Hooks): string {
  const { body, title } = splitFrontMatter(source);
  return wrapBody(renderBody(body), options, hooks, title);
}

export function wrapBody(
  body: string,
  options: PageOptions,
  hooks: Hooks,
  title = pageTitle(body, options.fallbackTitle),
): string {
  return renderPage(
    { title, body, css: options.css, liveReload: options.liveReload, nav: options.nav },
    hooks,
  );
}

export function renderPage(input: HtmlTemplateInput, hooks: Hooks): string {
  return hooks.last("md:html:template", input)?.value ?? defaultTemplate(input);
}

function defaultTemplate({ title, body, css, liveReload, nav }: HtmlTemplateInput): string {
  const main = `<main>\n${body}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${Bun.escapeHTML(title)}</title>
<style>${nav ? SITE_LAYOUT_CSS : ""}${css}</style>
</head>
<body>
${nav ? `<div class="btk-site">\n<nav class="btk-nav">${nav}</nav>\n${main}\n</div>` : main}
${liveReload}
</body>
</html>
`;
}

function codeHtml(lines: CodeLine[]): string {
  const html = lines.map((line) =>
    line
      .map((token) => {
        const text = Bun.escapeHTML(token.text);
        return token.kind ? `<span class="tok-${token.kind}">${text}</span>` : text;
      })
      .join(""),
  );
  return `${html.join("\n")}\n`;
}

function decodeEntities(html: string): string {
  return html.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}
