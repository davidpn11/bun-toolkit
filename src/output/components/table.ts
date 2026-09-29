import { formatValue } from "../format.ts";
import { padEndVisible, padStartVisible, type Styler, stripAnsi, visibleWidth } from "../style.ts";

export type TableColumn = {
  key: string;
  label?: string;
  align?: "left" | "right";
  paint?: (text: string, row: Record<string, unknown>) => string;
};

export type TableOptions = {
  title?: string;
  columns?: TableColumn[];
  /** Plain mode: tab-separated, no styling, easy to `cut`/`awk`. */
  plain?: boolean;
};

function inferColumns(rows: Record<string, unknown>[]): TableColumn[] {
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  return [...keys].map((key) => ({ key }));
}

export function renderTable(s: Styler, rows: Record<string, unknown>[], options: TableOptions = {}): string {
  const columns = options.columns ?? inferColumns(rows);
  const header = columns.map((c) => c.label ?? c.key);
  const cells = rows.map((row) => columns.map((c) => formatValue(row[c.key])));

  if (options.plain) {
    const lines = [header, ...cells].map((line) => line.map((cell) => stripAnsi(cell)).join("\t"));
    return [...(options.title ? [options.title] : []), ...lines].join("\n");
  }

  const widths = columns.map((_, i) =>
    Math.max(visibleWidth(header[i] ?? ""), ...cells.map((line) => visibleWidth(line[i] ?? ""))),
  );
  const last = columns.length - 1;
  const pad = (text: string, i: number) =>
    columns[i]?.align === "right"
      ? padStartVisible(text, widths[i] ?? 0)
      : i === last
        ? text
        : padEndVisible(text, widths[i] ?? 0);

  const out: string[] = [];
  if (options.title) out.push(s.title(options.title));
  out.push(
    header
      .map((h, i) => s.muted(pad(h, i)))
      .join("  ")
      .trimEnd(),
  );
  out.push(s.muted(widths.map((w) => "─".repeat(w)).join("  ")));
  rows.forEach((row, r) => {
    const line = cells[r] ?? [];
    out.push(
      line
        .map((text, i) => {
          const padded = pad(text, i);
          const paint = columns[i]?.paint;
          return paint ? padded.replace(text, paint(text, row)) : padded;
        })
        .join("  ")
        .trimEnd(),
    );
  });
  return out.join("\n");
}
