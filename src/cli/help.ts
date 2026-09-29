import type { ValueSource } from "../config/merge.ts";
import { formatValue } from "../output/format.ts";
import { icons } from "../output/palette.ts";
import { padEndVisible, type Styler, visibleWidth } from "../output/style.ts";
import { BIN, DESCRIPTION, NAME, VERSION } from "../version.ts";
import type { ActionDef, ArgsSpec, CommandDef, Entry, FlagSpec, Registry, ToolDef } from "./define.ts";
import { registeredTools } from "./define.ts";
import { globalFlags, toKebab, uiFlag } from "./global-args.ts";
import { inspectSchema, type SchemaInfo } from "./schema-info.ts";

type Row = [left: string, right: string];

function section(s: Styler, title: string, rows: Row[]): string[] {
  if (rows.length === 0) return [];
  const width = Math.min(34, Math.max(...rows.map(([left]) => visibleWidth(left))));
  const lines = [s.bold(title)];
  for (const [left, right] of rows) {
    if (visibleWidth(left) > width) {
      lines.push(`  ${left}`);
      if (right) lines.push(`  ${" ".repeat(width)}  ${right}`);
    } else {
      lines.push(`  ${padEndVisible(left, width)}  ${right}`.trimEnd());
    }
  }
  return ["", ...lines];
}

function valueHint(spec: FlagSpec, info: SchemaInfo): string {
  if (spec.valueHint) return ` ${spec.valueHint}`;
  switch (info.kind) {
    case "boolean":
      return "";
    case "enum":
      return ` <${info.enumValues?.join("|")}>`;
    case "number":
      return info.min !== undefined && info.max !== undefined ? ` <${info.min}-${info.max}>` : " <n>";
    case "array":
      return " <value...>";
    default:
      return " <value>";
  }
}

export type FlagHelpContext = {
  toolConfig?: Record<string, unknown>;
  toolName?: string;
  sources?: Record<string, ValueSource>;
};

function sourceLabel(source: ValueSource | undefined): string {
  if (!source || source.kind === "default") return "";
  if (source.kind === "env") return ` from ${source.origin}`;
  return ` from ${source.kind} config`;
}

function flagRows(s: Styler, args: ArgsSpec, ctx: FlagHelpContext = {}): Row[] {
  const rows: Row[] = [];
  for (const [key, spec] of Object.entries(args)) {
    if (spec.kind !== "flag" || spec.hidden) continue;
    const info = inspectSchema(spec.schema);
    const names = [spec.alias ? `-${spec.alias}, ` : "    ", `--${toKebab(key)}`].join("");
    let description = spec.description;

    const configured = spec.config ? ctx.toolConfig?.[spec.config] : undefined;
    if (configured !== undefined && info.kind !== "boolean") {
      const source = ctx.sources?.[`tools.${ctx.toolName}.${spec.config}`];
      description += s.muted(` (default: ${formatValue(configured)}${sourceLabel(source)})`);
    } else if (info.hasDefault && info.kind !== "boolean" && info.defaultValue !== undefined) {
      description += s.muted(` (default: ${formatValue(info.defaultValue)})`);
    }
    rows.push([s.accent(names) + s.muted(valueHint(spec, info)), description]);
  }
  return rows;
}

function positionalUsage(args: ArgsSpec | undefined): string {
  if (!args) return "";
  const parts: string[] = [];
  for (const [key, spec] of Object.entries(args)) {
    if (spec.kind !== "positional") continue;
    const info = inspectSchema(spec.schema);
    const name = `${spec.valueHint ?? key}${info.kind === "array" ? "..." : ""}`;
    parts.push(info.optional ? `[${name}]` : `<${name}>`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function positionalRows(s: Styler, args: ArgsSpec | undefined): Row[] {
  if (!args) return [];
  return Object.entries(args)
    .filter(([, spec]) => spec.kind === "positional")
    .map(([key, spec]) => [s.accent(spec.valueHint ?? key), spec.description]);
}

function header(s: Styler): string[] {
  return [`${s.accent(icons.logo)} ${s.title(NAME)} ${s.muted(`v${VERSION}`)}`, `  ${s.muted(DESCRIPTION)}`];
}

function globalRows(s: Styler): Row[] {
  return [...flagRows(s, globalFlags), [s.accent("    --version"), "Print the version"]];
}

function entryRow(s: Styler, entry: Entry): Row {
  const alias = entry.aliases?.length ? s.muted(` (${entry.aliases.join(", ")})`) : "";
  return [s.accent(entry.name) + alias, entry.description];
}

export function renderRootHelp(s: Styler, registry: Registry): string {
  const tools = registeredTools(registry);
  const builtins = registry.entries.filter((e) => !tools.includes(e as ToolDef));
  const lines = [
    ...header(s),
    "",
    s.bold("Usage"),
    `  ${BIN} <command> [options]`,
    `  ${BIN} <tool> --ui    ${s.muted("open a tool's dashboard")}`,
    ...(tools.length > 0
      ? section(
          s,
          "Tools",
          tools.map((t) => entryRow(s, t)),
        )
      : ["", s.bold("Tools"), `  ${s.muted("No tools installed yet.")}`]),
    ...section(
      s,
      "Commands",
      builtins.map((e) => entryRow(s, e)),
    ),
    ...section(s, "Global options", globalRows(s)),
    "",
    s.muted(`Run "${BIN} <command> --help" for details on a command.`),
  ];
  return lines.join("\n");
}

export function renderToolHelp(s: Styler, tool: ToolDef): string {
  const actions = Object.entries(tool.actions).filter(([, a]) => !a.hidden);
  const lines = [
    `${s.title(`${BIN} ${tool.name}`)} ${s.muted(tool.description)}`,
    "",
    s.bold("Usage"),
    `  ${BIN} ${tool.name} <action> [options]`,
    ...(tool.defaultAction
      ? [
          `  ${BIN} ${tool.name}${positionalUsage(tool.actions[tool.defaultAction]?.args)} [options] ${s.muted(`same as "${tool.name} ${tool.defaultAction}"`)}`,
        ]
      : []),
    ...(tool.ui ? [`  ${BIN} ${tool.name} --ui ${s.muted("interactive dashboard")}`] : []),
    ...section(
      s,
      "Actions",
      actions.map(([name, action]) => [
        s.accent(name) + (name === tool.defaultAction ? s.muted(" (default)") : ""),
        action.description,
      ]),
    ),
    ...(tool.ui ? section(s, "Options", flagRows(s, uiFlag)) : []),
    ...section(s, "Global options", globalRows(s)),
    "",
    s.muted(`Run "${BIN} ${tool.name} <action> --help" for the options of an action.`),
  ];
  return lines.join("\n");
}

export function renderActionHelp(
  s: Styler,
  commandPath: string,
  action: ActionDef | CommandDef,
  ctx: FlagHelpContext & { hasUi?: boolean } = {},
): string {
  const args = action.args ?? {};
  const hasFlags = Object.values(args).some((a) => a.kind === "flag");
  const lines = [
    `${s.title(`${BIN} ${commandPath}`)} ${s.muted(action.description)}`,
    "",
    s.bold("Usage"),
    `  ${BIN} ${commandPath}${positionalUsage(args)}${hasFlags ? " [options]" : ""}`,
    ...section(s, "Arguments", positionalRows(s, args)),
    ...section(s, "Options", [...flagRows(s, args, ctx), ...(ctx.hasUi ? flagRows(s, uiFlag) : [])]),
    ...section(s, "Global options", globalRows(s)),
    ...(action.examples?.length
      ? ["", s.bold("Examples"), ...action.examples.map((e) => `  ${s.muted("$")} ${e}`)]
      : []),
  ];
  return lines.join("\n");
}
