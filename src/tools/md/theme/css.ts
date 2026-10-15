export const BTK_CSS = `
:root {
  color-scheme: light dark;
  --accent: #ff1f8f;
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --border: #d8dee4;
  --code-bg: #f6f8fa;
  --keyword: #cf222e;
  --type: #0550ae;
  --string: #116329;
  --literal: #953800;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8d96a0;
    --border: #30363d;
    --code-bg: #161b22;
    --keyword: #ff7b72;
    --type: #79c0ff;
    --string: #7ee787;
    --literal: #ffa657;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
main { max-width: 860px; margin: 0 auto; padding: 48px 24px 96px; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 0.6em; }
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h1, h2 { color: var(--accent); }
main > :first-child { margin-top: 0; }
a { color: var(--accent); text-underline-offset: 2px; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
blockquote { margin-left: 0; padding: 0 1em; color: var(--muted); border-left: 4px solid var(--accent); }
code, pre { font: 0.875em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre code { font: inherit; }
:not(pre) > code { background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 6px; }
pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--border); padding: 6px 13px; }
th { font-weight: 600; }
tr:nth-child(2n) td { background: var(--code-bg); }
.task-list-item { list-style: none; }
.task-list-item-checkbox { accent-color: var(--accent); margin: 0 0.4em 0 -1.4em; }
.tok-keyword { color: var(--keyword); }
.tok-type { color: var(--type); }
.tok-string { color: var(--string); }
.tok-literal { color: var(--literal); }
.tok-comment { color: var(--muted); font-style: italic; }
.tok-punctuation { color: var(--muted); }
`;

export const PLAIN_CSS = `
body { margin: 0; font: 16px/1.6 Georgia, "Times New Roman", serif; }
main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; }
pre { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border: 1px solid; padding: 4px 8px; }
img { max-width: 100%; }
`;
