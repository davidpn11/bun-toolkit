import { type MdNode, textOf } from "../tree.ts";
import type { TerminalCtx } from "./paint.ts";

export function renderInline(nodes: readonly MdNode[], ctx: TerminalCtx): string {
  return nodes.map((node) => inlineNode(node, ctx)).join("");
}

function inlineNode(node: MdNode, ctx: TerminalCtx): string {
  const { theme, paint } = ctx;
  const inner = () => renderInline(node.children, ctx);
  switch (node.type) {
    case "text":
      return node.text;
    case "break":
      return " ";
    case "strong":
      return paint(theme.strong)(inner());
    case "emphasis":
      return paint(theme.emphasis)(inner());
    case "strikethrough":
      return paint(theme.strikethrough)(inner());
    case "codespan":
      return paint(theme.codespan)(inner());
    case "link":
      return renderLink(node, ctx);
    case "image":
      return renderImage(node, ctx);
    default:
      return inner();
  }
}

function renderLink(node: MdNode, ctx: TerminalCtx): string {
  // oxlint-disable-next-line no-control-regex
  const href = (node.meta.href ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  const label = ctx.paint(ctx.theme.link)(renderInline(node.children, ctx));
  if (ctx.hyperlinks) return `\x1b]8;;${href}\x1b\\${label}\x1b]8;;\x1b\\`;
  if (href.startsWith("#") || sameAsLabel(href, textOf(node.children))) return label;
  return `${label} ${ctx.paint(ctx.theme.url)(`(${href})`)}`;
}

function renderImage(node: MdNode, ctx: TerminalCtx): string {
  const alt = textOf(node.children) || "image";
  const src = node.meta.src ?? "";
  return `${ctx.paint(ctx.theme.image)(`[${alt}]`)} ${ctx.paint(ctx.theme.url)(`(${src})`)}`;
}

/** Autolinks such as `www.bun.sh` get an `http://` the label does not show. */
function sameAsLabel(href: string, label: string): boolean {
  return href === label || href.replace(/^(https?:\/\/|mailto:)/, "") === label;
}
