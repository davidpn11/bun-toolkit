import { defineAction, defineTool } from "../cli/define.ts";
import { displayPath } from "../config/loader.ts";
import type { ValueSource } from "../config/merge.ts";
import type { ResolvedConfig } from "../config/schema.ts";
import type { BtkContext } from "../context.ts";
import { icons } from "../output/palette.ts";

export type ConfigValueRow = {
  key: string;
  value: unknown;
  source: ValueSource["kind"];
  origin?: string;
};

function flatten(config: ResolvedConfig): [string, unknown][] {
  const rows: [string, unknown][] = [];
  const walk = (value: unknown, prefix: string) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      for (const [key, inner] of entries) walk(inner, prefix ? `${prefix}.${key}` : key);
      return;
    }
    rows.push([prefix, value]);
  };
  walk({ tools: config.tools, output: config.output, noLocalConfig: config.noLocalConfig }, "");
  if (config.plugins.length > 0) rows.push(["plugins", config.plugins.map((p) => p.name)]);
  return rows;
}

export function configRows(ctx: BtkContext): ConfigValueRow[] {
  return flatten(ctx.config).map(([key, value]) => {
    const source = ctx.configInfo.sources[key] ?? { kind: "default" as const };
    return { key, value, source: source.kind, ...(source.origin && { origin: source.origin }) };
  });
}

export function sourceText(row: ConfigValueRow, ctx: BtkContext): string {
  if (row.source === "default") return "default";
  if (row.source === "env") return `env ${row.origin}`;
  return `${row.source} ${row.origin ? displayPath(row.origin, ctx.cwd) : ""}`.trim();
}

const show = defineAction({
  description: "Print the resolved config and where each value comes from",
  examples: ["btk config show", "btk config show --json"],
  run: (_input, ctx) => ({
    files: {
      global: ctx.configInfo.files.global?.path ?? null,
      project: ctx.configInfo.files.project?.path ?? null,
    },
    values: configRows(ctx),
  }),
  render(result, out, ctx) {
    const s = out.style;
    if (result.values.length === 0) {
      out.text(s.muted("No config values are set, and no installed tool has defaults yet."));
    } else {
      out.table(
        result.values.map((row) => ({ key: row.key, value: row.value, source: sourceText(row, ctx) })),
        {
          title: "Resolved config",
          columns: [
            { key: "key" },
            { key: "value" },
            { key: "source", paint: (text) => (text === "default" ? s.muted(text) : s.accent(text)) },
          ],
        },
      );
    }
    const files = [ctx.configInfo.files.global, ctx.configInfo.files.project].filter(Boolean);
    out.text();
    out.text(
      files.length > 0
        ? s.muted(`Files: ${files.map((f) => f?.displayPath).join(", ")}`)
        : s.muted(`No config files found. Create one with "btk init".`),
    );
  },
});

const validate = defineAction({
  description: "Check the global and project config files (exits 78 when invalid)",
  examples: ["btk config validate", "btk config validate --config ./ci/btk.config.ts"],
  requiresConfig: false,
  run(_input, ctx) {
    if (ctx.configInfo.error) throw ctx.configInfo.error;
    const checked = [ctx.configInfo.files.global, ctx.configInfo.files.project]
      .filter((f) => f !== undefined)
      .map((f) => ({ scope: f.scope, path: f.path }));
    return { valid: true, files: checked };
  },
  render(result, out, ctx) {
    const s = out.style;
    if (result.files.length === 0) {
      out.text(`${s.success(icons.success)} No config files found; built-in defaults apply`);
      return;
    }
    for (const file of result.files) {
      out.text(
        `${s.success(icons.success)} ${displayPath(file.path, ctx.cwd)} ${s.muted(`(${file.scope})`)}`,
      );
    }
    out.text(s.muted(`  Config is valid`));
  },
});

const path = defineAction({
  description: "Show where config files are looked up",
  requiresConfig: false,
  run: (_input, ctx) => ({
    globalDir: ctx.configInfo.globalDir,
    global: ctx.configInfo.files.global?.path ?? null,
    project: ctx.configInfo.files.project?.path ?? null,
    searchFrom: ctx.cwd,
  }),
  render(result, out, ctx) {
    const s = out.style;
    const show = (p: string | null) => (p ? displayPath(p, ctx.cwd) : s.muted("not found"));
    out.keyValue({
      global: show(result.global),
      "global dir": displayPath(result.globalDir, ctx.cwd),
      project: show(result.project),
      "search from": `${displayPath(result.searchFrom, ctx.cwd) || "."} ${s.muted("(and parent directories)")}`,
    });
  },
});

export const config = defineTool({
  name: "config",
  description: "Inspect and validate configuration",
  builtin: true,
  defaultAction: "show",
  actions: { show, validate, path },
});
