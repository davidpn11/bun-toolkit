import pkg from "../package.json" with { type: "json" };

export const NAME = pkg.name;
export const VERSION = pkg.version;
export const DESCRIPTION = pkg.description;
export const BIN = "btk";
/** The exact Bun release btk is built and tested on, from `packageManager` in package.json. */
export const BUN_VERSION = pkg.packageManager.replace(/^bun@/, "");
