import type { z } from "zod";
import type { ArgsSpec } from "../cli/define.ts";
import { inspectSchema } from "../cli/schema-info.ts";

export type FieldKind = "number" | "enum" | "boolean" | "text";

export type FormField = {
  key: string;
  label: string;
  description: string;
  kind: FieldKind;
  schema: z.ZodType;
  options?: string[];
  min?: number;
  max?: number;
  step: number;
  optional: boolean;
};

export function labelFor(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldsFromArgs(args: ArgsSpec, options: { exclude?: string[] } = {}): FormField[] {
  const fields: FormField[] = [];
  for (const [key, spec] of Object.entries(args)) {
    if (spec.kind !== "flag" || spec.hidden || options.exclude?.includes(key)) continue;
    const info = inspectSchema(spec.schema);
    const kind: FieldKind | undefined =
      info.kind === "number"
        ? "number"
        : info.kind === "enum"
          ? "enum"
          : info.kind === "boolean"
            ? "boolean"
            : info.kind === "string"
              ? "text"
              : undefined;
    if (!kind) continue;
    fields.push({
      key,
      label: labelFor(key),
      description: spec.description,
      kind,
      schema: spec.schema,
      ...(info.enumValues && { options: info.enumValues }),
      ...(info.min !== undefined && { min: info.min }),
      ...(info.max !== undefined && { max: info.max }),
      step: kind === "number" && info.max !== undefined && info.max - (info.min ?? 0) > 500 ? 10 : 1,
      optional: info.optional,
    });
  }
  return fields;
}

export function initialValues(
  args: ArgsSpec,
  toolConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(args)) {
    if (spec.kind !== "flag") continue;
    const fromConfig = spec.config ? toolConfig[spec.config] : undefined;
    if (fromConfig !== undefined) {
      values[key] = fromConfig;
      continue;
    }
    const parsed = spec.schema.safeParse(undefined);
    if (parsed.success && parsed.data !== undefined) values[key] = parsed.data;
  }
  return values;
}
