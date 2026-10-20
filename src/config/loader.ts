import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve, sep } from "node:path";
import type { ToolDef } from "../cli/define.ts";
import { ConfigError } from "../errors.ts";
import { readEnvLayer } from "./env.ts";
import { type ConfigIssue, formatIssues, issueLines } from "./format-issues.ts";
import { type Layer, mergeLayers, type ValueSource } from "./merge.ts";
import { findGlobalConfig, findProjectConfig, globalConfigDir, isJsonConfig } from "./paths.ts";
import { buildConfigFileSchema, defaultsLayer, finalizeConfig, type ResolvedConfig } from "./schema.ts";
import { installConfigModule } from "./virtual-module.ts";

export type ConfigScope = "global" | "project";

export type ConfigFileStatus = {
  scope: ConfigScope;
  path: string;
  displayPath: string;
  status: "ok" | "invalid" | "unreadable";
  issues: ConfigIssue[];
};

export type LoadedConfig = {
  config: ResolvedConfig;
  sources: Record<string, ValueSource>;
  globalDir: string;
  files: { global?: ConfigFileStatus; project?: ConfigFileStatus };
  envIssues: ConfigIssue[];
  mergedIssues: ConfigIssue[];
  error?: ConfigError;
};

export type LoadConfigOptions = {
  cwd: string;
  env: Record<string, string | undefined>;
  tools: readonly ToolDef[];
  explicitPath?: string | undefined;
  project?: boolean;
};

export function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  if (rel === "") return ".";
  const ups = rel.split(sep).filter((part) => part === "..").length;
  if (!rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel)) {
    if (ups === 0) return `.${sep}${rel}`;
    if (ups <= 2) return rel;
  }
  const home = homedir();
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

export async function importConfigFile(path: string): Promise<unknown> {
  if (isJsonConfig(path)) return parseJsonConfig(await Bun.file(path).text());
  installConfigModule();
  const mod = (await import(path)) as Record<string, unknown>;
  return "default" in mod ? mod.default : { ...mod };
}

function parseJsonConfig(text: string): unknown {
  try {
    return Bun.JSONC.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message.replace(/^\w+ Parse error: /, "")}`);
  }
}

/** Bun reports syntax errors as BuildMessage objects with a position; include line:column when present. */
function loadErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const position = (error as { position?: { line?: number; column?: number } } | null)?.position;
  return position?.line ? `${message} (line ${position.line}, column ${position.column ?? 0})` : message;
}

async function readLayer(
  scope: ConfigScope,
  path: string,
  cwd: string,
  tools: readonly ToolDef[],
): Promise<{ status: ConfigFileStatus; values?: Record<string, unknown> }> {
  const schema = buildConfigFileSchema(tools, scope);
  const status: ConfigFileStatus = {
    scope,
    path,
    displayPath: displayPath(path, cwd),
    status: "ok",
    issues: [],
  };
  let raw: unknown;
  try {
    raw = await importConfigFile(path);
  } catch (error) {
    status.status = "unreadable";
    status.issues = [{ path: "", message: `Could not load the file: ${loadErrorMessage(error)}` }];
    return { status };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    status.status = "invalid";
    const message = isJsonConfig(path)
      ? "The file must contain a JSON object: { ... }"
      : "The default export must be an object: export default defineConfig({ ... })";
    status.issues = [{ path: "", message }];
    return { status };
  }

  const parsed = schema.safeParse(raw, { reportInput: true });
  if (!parsed.success) {
    status.status = "invalid";
    status.issues = formatIssues(parsed.error.issues, schema);
    return { status };
  }
  return { status, values: raw as Record<string, unknown> };
}

/** Never throws for bad config: `error` lets each command decide whether it can still run. */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const { cwd, env, tools } = options;
  const layers: Layer[] = [{ source: { kind: "default" }, values: defaultsLayer(tools) }];
  const files: LoadedConfig["files"] = {};

  const globalPath = findGlobalConfig(env);
  if (globalPath) {
    const { status, values } = await readLayer("global", globalPath, cwd, tools);
    files.global = status;
    if (values) layers.push({ source: { kind: "global", origin: globalPath }, values });
  }

  let projectPath: string | undefined;
  if (options.explicitPath) {
    projectPath = resolve(cwd, options.explicitPath);
    if (!existsSync(projectPath)) {
      files.project = {
        scope: "project",
        path: projectPath,
        displayPath: displayPath(projectPath, cwd),
        status: "unreadable",
        issues: [{ path: "", message: "File not found (from --config)" }],
      };
      projectPath = undefined;
    }
  } else if (options.project !== false) {
    projectPath = findProjectConfig(cwd, env);
  }
  if (projectPath) {
    const { status, values } = await readLayer("project", projectPath, cwd, tools);
    files.project = status;
    if (values) layers.push({ source: { kind: "project", origin: projectPath }, values });
  }

  const envLayer = readEnvLayer(env, tools);
  layers.push({ source: { kind: "env" }, values: envLayer.values });

  const merged = mergeLayers(layers);
  for (const [path, origin] of Object.entries(envLayer.origins))
    merged.sources[path] = { kind: "env", origin };

  const finalized = finalizeConfig(merged.values, tools);
  const loaded: LoadedConfig = {
    config: finalized.config,
    sources: merged.sources,
    globalDir: globalConfigDir(env),
    files,
    envIssues: envLayer.issues,
    mergedIssues: finalized.issues,
  };
  loaded.error = configErrorFor(loaded);
  return loaded;
}

export function configErrorFor(
  loaded: Pick<LoadedConfig, "files" | "envIssues" | "mergedIssues">,
): ConfigError | undefined {
  const details: string[] = [];
  let count = 0;
  for (const file of [loaded.files.global, loaded.files.project]) {
    if (!file || file.status === "ok") continue;
    count += file.issues.length;
    details.push(`${file.displayPath} (${file.scope})`);
    details.push(...issueLines(file.issues, "  "));
  }
  if (loaded.envIssues.length > 0) {
    count += loaded.envIssues.length;
    details.push("Environment variables");
    details.push(...issueLines(loaded.envIssues, "  "));
  }
  if (loaded.mergedIssues.length > 0) {
    count += loaded.mergedIssues.length;
    details.push("Combined configuration (global + project + env)");
    details.push(...issueLines(loaded.mergedIssues, "  "));
  }
  if (count === 0) return undefined;
  const unreadable = [loaded.files.global, loaded.files.project].some((f) => f?.status === "unreadable");
  const title = unreadable ? "Could not load the configuration" : "Invalid configuration";
  return new ConfigError(count === 1 ? title : `${title} (${count} problems)`, {
    code: unreadable ? "ERR_CONFIG_LOAD" : "ERR_CONFIG_INVALID",
    details,
    hint: unreadable
      ? "Fix the file so it can be imported, then check with: btk config validate"
      : "Fix the values above, then check with: btk config validate",
  });
}
