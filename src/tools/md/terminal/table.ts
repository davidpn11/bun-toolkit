import { padEndVisible, padStartVisible, visibleWidth } from "../../../output/style.ts";
import type { MdNode } from "../tree.ts";
import { BOXES, type Box } from "./box.ts";
import { renderInline } from "./inline.ts";
import type { Paint, TerminalCtx } from "./paint.ts";

type Cell = {
  text: string;
  align: "left" | "center" | "right";
  header: boolean;
};

export function renderTable(node: MdNode, ctx: TerminalCtx): string[] {
  const rows = tableRows(node, ctx);
  const widths = columnWidths(rows);
  const box = BOXES[ctx.theme.glyphs.box];
  const border = ctx.paint(ctx.theme.table.border);
  const header = ctx.paint(ctx.theme.table.header);
  const rule = (left: string, join: string, right: string) =>
    border(`${left}${widths.map((w) => box.h.repeat(w + 2)).join(join)}${right}`);

  const lines = [rule(box.topLeft, box.topJoin, box.topRight)];
  rows.forEach((row, i) => {
    lines.push(renderRow(row, widths, box, border, header));
    if (row[0]?.header && !rows[i + 1]?.[0]?.header && i < rows.length - 1)
      lines.push(rule(box.leftJoin, box.cross, box.rightJoin));
  });
  lines.push(rule(box.bottomLeft, box.bottomJoin, box.bottomRight));
  return lines;
}

function tableRows(table: MdNode, ctx: TerminalCtx): Cell[][] {
  return table.children
    .flatMap((section) => section.children)
    .filter((row) => row.type === "tr")
    .map((row) =>
      row.children.map((cell) => ({
        text: renderInline(cell.children, ctx),
        align: cell.meta.align ?? "left",
        header: cell.type === "th",
      })),
    );
}

function columnWidths(rows: Cell[][]): number[] {
  const count = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: count }, (_, i) =>
    Math.max(1, ...rows.map((row) => visibleWidth(row[i]?.text ?? ""))),
  );
}

function renderRow(row: Cell[], widths: number[], box: Box, border: Paint, header: Paint): string {
  const cells = widths.map((width, i) => {
    const cell = row[i] ?? { text: "", align: "left", header: false };
    const text = alignCell(cell.text, width, cell.align);
    return ` ${cell.header ? header(text) : text} `;
  });
  return `${border(box.v)}${cells.join(border(box.v))}${border(box.v)}`;
}

function alignCell(text: string, width: number, align: Cell["align"]): string {
  if (align === "right") return padStartVisible(text, width);
  if (align === "center") {
    const left = Math.floor((width - visibleWidth(text)) / 2);
    return padEndVisible(" ".repeat(left) + text, width);
  }
  return padEndVisible(text, width);
}
