import type { BtkContext } from "../../context.ts";
import type { Output } from "../../output/reporter.ts";
import type { HtmlResult, PreviewResult, ThemeRow } from "./tool.ts";

export function renderPreview(result: PreviewResult, out: Output, ctx: BtkContext): void {
  if (result.mode === "terminal") out.text(result.output);
  else if (result.mode === "site") ctx.reporter.log.success(`Stopped serving ${result.root}`);
  else ctx.reporter.log.success(`Stopped the preview of ${result.file}`);
}

export function renderHtml(result: HtmlResult, out: Output): void {
  out.raw(result.html);
}

export function renderThemes(rows: ThemeRow[], out: Output): void {
  const s = out.style;
  out.table(
    rows.map((row) => ({ ...row, default: row.default ? "default" : "" })),
    {
      columns: [
        { key: "name", paint: (text, row) => (row.default ? s.accent(text) : text) },
        { key: "source", paint: (text) => s.muted(text) },
        { key: "description" },
        { key: "default", label: "", paint: (text) => s.accent(text) },
      ],
    },
  );
  out.text();
  out.text(s.muted("Pick one with --theme <name> or tools.md.theme. Plugins can add more."));
}
