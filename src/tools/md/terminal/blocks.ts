import { visibleWidth } from "../../../output/style.ts";
import { type CodeLine, highlight } from "../highlight.ts";
import { BLOCK_TYPES, type MdNode, textOf } from "../tree.ts";
import { BOXES } from "./box.ts";
import { renderInline } from "./inline.ts";
import { type Paint, pick, type TerminalCtx } from "./paint.ts";
import { renderTable } from "./table.ts";

const MIN_WIDTH = 20;
const LIST_INDENT = 2;

type Marker = { text: string; paint: Paint };

/** Renders blocks as lines; `gap` puts a blank line between them (off inside tight list items). */
export function renderBlocks(
  nodes: readonly MdNode[],
  width: number,
  ctx: TerminalCtx,
  gap = true,
): string[] {
  return joinBlocks(
    groupInline(nodes).map((node) => renderBlock(node, width, ctx)),
    gap,
  );
}

function renderBlock(node: MdNode, width: number, ctx: TerminalCtx): string[] {
  switch (node.type) {
    case "heading":
      return renderHeading(node, width, ctx);
    case "blockquote":
      return renderQuote(node, width, ctx);
    case "code":
      return renderCode(node, ctx);
    case "list":
      return renderList(node, width, ctx);
    case "hr":
      return [ctx.paint(ctx.theme.rule)(ctx.theme.glyphs.rule.repeat(width))];
    case "table":
      return renderTable(node, ctx);
    case "html":
      return textOf(node.children).trimEnd().split("\n").map(ctx.paint(ctx.theme.html));
    default:
      return wrap(renderInline(node.children, ctx), width);
  }
}

function renderHeading(node: MdNode, width: number, ctx: TerminalCtx): string[] {
  const { theme } = ctx;
  const level = node.meta.level ?? 1;
  const text = pick(theme.glyphs.heading, level) + renderInline(node.children, ctx);
  const lines = wrap(text, width).map(ctx.paint(pick(theme.heading, level)));
  if (level !== 1 || !theme.glyphs.rule) return lines;
  const underline = theme.glyphs.rule.repeat(Math.max(...lines.map(visibleWidth)));
  return [...lines, ctx.paint(theme.headingRule)(underline)];
}

function renderQuote(node: MdNode, width: number, ctx: TerminalCtx): string[] {
  const bar = `${ctx.paint(ctx.theme.blockquote)(ctx.theme.glyphs.quote)} `;
  return renderBlocks(node.children, width - visibleWidth(bar), ctx).map((line) => `${bar}${line}`.trimEnd());
}

function renderCode(node: MdNode, ctx: TerminalCtx): string[] {
  const { theme, paint } = ctx;
  const box = BOXES[theme.glyphs.box];
  const border = paint(theme.codeBlock.border);
  const language = node.meta.language;
  const label = language ? ` ${paint(theme.codeBlock.language)(language)}` : "";
  const body = highlight(textOf(node.children), language).map((line) =>
    `${border(box.v)} ${paintCode(line, ctx)}`.trimEnd(),
  );
  return [`${border(box.topLeft + box.h)}${label}`, ...body, border(box.bottomLeft + box.h)];
}

function paintCode(line: CodeLine, ctx: TerminalCtx): string {
  const { syntax, codeBlock } = ctx.theme;
  return line
    .map((token) => ctx.paint(token.kind ? syntax[token.kind] : codeBlock.text)(token.text))
    .join("");
}

function renderList(node: MdNode, width: number, ctx: TerminalCtx): string[] {
  const items = node.children.filter((child) => child.type === "listItem");
  const loose = items.some((item) => item.children.some((child) => child.type === "paragraph"));
  const markers = items.map((item) => markerFor(item, node, ctx));
  const widest = Math.max(...markers.map((m) => visibleWidth(m.text)));
  const indent = node.meta.depth === 0 ? LIST_INDENT : 0;
  const rendered = items.map((item, i) => {
    const marker = markers[i] as Marker;
    const markerWidth = (node.meta.ordered ? widest : visibleWidth(marker.text)) + 1;
    return renderItem(item, marker, markerWidth, width - indent, ctx, loose);
  });
  return joinBlocks(rendered, loose).map((line) => (line ? " ".repeat(indent) + line : line));
}

function markerFor(item: MdNode, list: MdNode, ctx: TerminalCtx): Marker {
  const { glyphs, list: styles } = ctx.theme;
  const { checked, index = 0 } = item.meta;
  if (checked !== undefined) {
    return checked
      ? { text: glyphs.taskDone, paint: ctx.paint(styles.taskDone) }
      : { text: glyphs.taskTodo, paint: ctx.paint(styles.taskTodo) };
  }
  if (list.meta.ordered)
    return { text: `${(list.meta.start ?? 1) + index}.`, paint: ctx.paint(styles.number) };
  return { text: pick(glyphs.bullets, (list.meta.depth ?? 0) + 1), paint: ctx.paint(styles.bullet) };
}

function renderItem(
  item: MdNode,
  marker: Marker,
  markerWidth: number,
  width: number,
  ctx: TerminalCtx,
  loose: boolean,
): string[] {
  const [first = "", ...rest] = renderBlocks(item.children, width - markerWidth, ctx, loose);
  const pad = " ".repeat(markerWidth);
  return [
    `${marker.paint(marker.text)}${" ".repeat(markerWidth - visibleWidth(marker.text))}${first}`,
    ...rest.map((line) => (line ? pad + line : line)),
  ];
}

/** Text directly inside a tight list item has no paragraph around it. */
function groupInline(nodes: readonly MdNode[]): MdNode[] {
  const grouped: MdNode[] = [];
  let run: MdNode | undefined;
  for (const node of nodes) {
    if (BLOCK_TYPES.has(node.type)) {
      grouped.push(node);
      run = undefined;
    } else if (run) {
      run.children.push(node);
    } else {
      run = { type: "paragraph", children: [node], text: "", meta: {} };
      grouped.push(run);
    }
  }
  return grouped;
}

function wrap(text: string, width: number): string[] {
  return Bun.wrapAnsi(text, Math.max(width, MIN_WIDTH), { hard: true }).split("\n");
}

function joinBlocks(blocks: string[][], gap: boolean): string[] {
  return blocks.flatMap((lines, i) => (gap && i > 0 ? ["", ...lines] : lines));
}
