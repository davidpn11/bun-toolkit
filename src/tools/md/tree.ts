type Meta = Partial<
  Bun.markdown.HeadingMeta &
    Bun.markdown.CodeBlockMeta &
    Bun.markdown.ListMeta &
    Bun.markdown.ListItemMeta &
    Bun.markdown.CellMeta &
    Bun.markdown.LinkMeta &
    Bun.markdown.ImageMeta
>;

export type NodeType =
  | "heading"
  | "paragraph"
  | "blockquote"
  | "code"
  | "list"
  | "listItem"
  | "hr"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "html"
  | "strong"
  | "emphasis"
  | "link"
  | "image"
  | "codespan"
  | "strikethrough"
  | "text"
  | "break";

export type MdNode = {
  type: NodeType;
  children: MdNode[];
  text: string;
  meta: Meta;
};

export const BLOCK_TYPES: ReadonlySet<NodeType> = new Set([
  "heading",
  "paragraph",
  "blockquote",
  "code",
  "list",
  "hr",
  "table",
  "html",
]);

export const PARSER_OPTIONS: Bun.markdown.Options = { autolinks: true };

const NUL = String.fromCharCode(0);
const REF = new RegExp(`${NUL}(\\d+)${NUL}`);

/**
 * Parses markdown into a tree. `Bun.markdown.render()` calls back innermost first with each element's
 * rendered children, so every callback returns a reference to the node it stored.
 */
export function parseMarkdown(source: string): MdNode[] {
  const nodes: MdNode[] = [];
  const store = (node: MdNode) => `${NUL}${nodes.push(node) - 1}${NUL}`;
  const childrenOf = (rendered: string) => splitChildren(rendered, nodes);
  const element =
    (type: NodeType) =>
    (children: string, meta?: object): string =>
      store({ type, children: childrenOf(children), text: "", meta: { ...meta } });
  const root = Bun.markdown.render(source, callbacks(element, store), PARSER_OPTIONS);
  return childrenOf(root);
}

function callbacks(
  element: (type: NodeType) => (children: string, meta?: object) => string,
  store: (node: MdNode) => string,
): Bun.markdown.RenderCallbacks {
  return {
    heading: element("heading"),
    paragraph: element("paragraph"),
    blockquote: element("blockquote"),
    code: element("code"),
    list: element("list"),
    listItem: element("listItem"),
    hr: element("hr"),
    table: element("table"),
    thead: element("thead"),
    tbody: element("tbody"),
    tr: element("tr"),
    th: element("th"),
    td: element("td"),
    html: element("html"),
    strong: element("strong"),
    emphasis: element("emphasis"),
    link: element("link"),
    image: element("image"),
    codespan: element("codespan"),
    strikethrough: element("strikethrough"),
    text: (text) => store({ type: "text", children: [], text, meta: {} }),
  };
}

/** Line breaks reach the parent as bare newlines between references. */
function splitChildren(rendered: string, nodes: readonly MdNode[]): MdNode[] {
  return rendered.split(REF).flatMap((part, i): MdNode[] => {
    if (i % 2 === 1) return [nodes[Number(part)] as MdNode];
    if (!part) return [];
    const type = part.trim() === "" ? "break" : "text";
    return [{ type, children: [], text: part, meta: {} }];
  });
}

export function textOf(nodes: readonly MdNode[]): string {
  return nodes.map((node) => (node.type === "text" ? node.text : textOf(node.children))).join("");
}
