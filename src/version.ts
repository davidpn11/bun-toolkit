import pkg from "../package.json" with { type: "json" };

export const NAME = pkg.name;
export const VERSION = pkg.version;
export const DESCRIPTION = pkg.description;
export const BIN = "btk";
