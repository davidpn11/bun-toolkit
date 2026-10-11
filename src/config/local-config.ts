import { join } from "node:path";
import { ConfigError } from "../errors.ts";
import { icons } from "../output/palette.ts";
import type { Reporter } from "../output/reporter.ts";
import { displayPath, type LoadedConfig } from "./loader.ts";
import { GLOBAL_CONFIG_FILENAMES } from "./paths.ts";

export function checkLocalConfig(configInfo: LoadedConfig, cwd: string, reporter: Reporter): void {
  const mode = configInfo.config.noLocalConfig;
  if (configInfo.files.project || mode === "off") return;

  const { global } = configInfo.files;
  const globalFile =
    global?.displayPath ?? displayPath(join(configInfo.globalDir, GLOBAL_CONFIG_FILENAMES[0] ?? ""), cwd);
  const hint = `Create one with "btk init", or set noLocalConfig: "off" in ${globalFile}`;

  if (mode === "error") {
    throw new ConfigError('No local config found (noLocalConfig is "error")', {
      code: "ERR_NO_LOCAL_CONFIG",
      hint,
    });
  }
  const fallback = global ? `the global config (${global.displayPath})` : "built-in defaults";
  reporter.log.warn(
    `No local config found, using ${fallback}\n${reporter.style.muted(`${icons.arrow} ${hint}`)}`,
  );
}
