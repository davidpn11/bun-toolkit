import { type Collected, type CollectOptions, collectFiles, type InputFile } from "../../shared/collect.ts";
import { isImagePath } from "./formats.ts";

export type ImageFile = InputFile;
export type { Collected };

export function collectImages(
  paths: readonly string[],
  options: Omit<CollectOptions, "accept">,
): Promise<Collected> {
  return collectFiles(paths, { ...options, accept: isImagePath });
}
