import type { Hooks, HtmlTemplateInput } from "../../../plugins/types.ts";
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
};

export function buildPage(source: string, options: PageOptions, hooks: Hooks): string {
  const body = renderBody(source);
  const title = pageTitle(body, options.fallbackTitle);
  return renderPage({ title, body, css: options.css, liveReload: options.liveReload }, hooks);
}

export function renderPage(input: HtmlTemplateInput, hooks: Hooks): string {
  return hooks.last("md:html:template", input)?.value ?? defaultTemplate(input);
}

function defaultTemplate({ title, body, css, liveReload }: HtmlTemplateInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${Bun.escapeHTML(title)}</title>
<style>${css}</style>
</head>
<body>
<main>
${body}</main>
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
