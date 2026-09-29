import type { z } from "zod";

export type ValueKind = "boolean" | "number" | "string" | "enum" | "array" | "unknown";

export type SchemaInfo = {
  kind: ValueKind;
  /** Element kind when `kind === "array"`. */
  itemKind?: ValueKind;
  enumValues?: string[];
  defaultValue?: unknown;
  hasDefault: boolean;
  /** Accepts `undefined` (optional or defaulted). */
  optional: boolean;
  min?: number;
  max?: number;
  /** `min`/`max` exclude the value itself (only for non-integers, e.g. `z.number().positive()`). */
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
  isInt?: boolean;
  description?: string;
};

type AnySchema = z.ZodType;

type BoundCheck = {
  check: string;
  value?: unknown;
  inclusive?: boolean;
};

type Def = {
  type: string;
  innerType?: AnySchema;
  defaultValue?: unknown;
  element?: AnySchema;
  in?: AnySchema;
  out?: AnySchema;
};

function defOf(schema: AnySchema): Def {
  return (schema as unknown as { def: Def }).def;
}

/**
 * Reads what the CLI, help text, env mapping and TUI forms need to know about a zod schema:
 * its base type, enum choices, bounds and default. Wrappers (optional, default, pipe...) are peeled off.
 */
export function inspectSchema(schema: AnySchema): SchemaInfo {
  let current: AnySchema = schema;
  let hasDefault = false;
  let defaultValue: unknown;
  let optional = false;
  const description = (schema as { description?: string }).description;

  for (let depth = 0; depth < 10; depth++) {
    const def = defOf(current);
    if (def.type === "default" || def.type === "prefault") {
      hasDefault = true;
      optional = true;
      defaultValue = def.defaultValue;
      current = def.innerType as AnySchema;
    } else if (
      def.type === "optional" ||
      def.type === "nullable" ||
      def.type === "readonly" ||
      def.type === "catch"
    ) {
      if (def.type === "optional") optional = true;
      current = def.innerType as AnySchema;
    } else if (def.type === "pipe") {
      current = def.in as AnySchema;
    } else {
      break;
    }
  }

  const info: SchemaInfo = { kind: "unknown", hasDefault, optional, defaultValue, description };
  const def = defOf(current);
  switch (def.type) {
    case "boolean":
      info.kind = "boolean";
      break;
    case "number":
    case "int": {
      info.kind = "number";
      const n = current as unknown as { isInt: boolean; def: { checks?: { _zod: { def: BoundCheck } }[] } };
      info.isInt = n.isInt;
      for (const check of n.def.checks ?? []) {
        const { check: kind, value, inclusive } = check._zod.def;
        if (typeof value !== "number" || Math.abs(value) >= Number.MAX_SAFE_INTEGER) continue;
        // Exclusive integer bounds become inclusive ones: positive() is "≥ 1", not "> 0".
        if (kind === "greater_than") {
          info.min = inclusive || !info.isInt ? value : value + 1;
          if (!inclusive && !info.isInt) info.exclusiveMin = true;
        } else if (kind === "less_than") {
          info.max = inclusive || !info.isInt ? value : value - 1;
          if (!inclusive && !info.isInt) info.exclusiveMax = true;
        }
      }
      break;
    }
    case "string":
      info.kind = "string";
      break;
    case "enum":
      info.kind = "enum";
      info.enumValues = (current as unknown as { options: string[] }).options.map(String);
      break;
    case "array":
      info.kind = "array";
      info.itemKind = inspectSchema(def.element as AnySchema).kind;
      break;
  }
  if (!optional) info.optional = schema.safeParse(undefined).success;
  return info;
}

/** Converts raw text (flag or env var) toward the schema's type so zod reports real problems, not "expected number, got string". */
export function coerceText(raw: string, kind: ValueKind): unknown {
  switch (kind) {
    case "number": {
      const trimmed = raw.trim();
      const n = Number(trimmed);
      return trimmed === "" || Number.isNaN(n) ? raw : n;
    }
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      return raw;
    }
    default:
      return raw;
  }
}

/** Short human description of the expected value, for help text and error hints. */
export function describeExpected(info: SchemaInfo): string {
  switch (info.kind) {
    case "enum":
      return `one of ${info.enumValues?.join(", ")}`;
    case "number": {
      const type = info.isInt ? "an integer" : "a number";
      const low = info.min === undefined ? "" : `${info.exclusiveMin ? ">" : "≥"} ${info.min}`;
      const high = info.max === undefined ? "" : `${info.exclusiveMax ? "<" : "≤"} ${info.max}`;
      if (low && high && !info.exclusiveMin && !info.exclusiveMax)
        return `${type} from ${info.min} to ${info.max}`;
      if (low && high) return `${type} ${low} and ${high}`;
      if (low || high) return `${type} ${low || high}`;
      return type;
    }
    case "boolean":
      return "true or false";
    case "array":
      return `a list of ${info.itemKind === "number" ? "numbers" : "values"}`;
    default:
      return "a string";
  }
}
