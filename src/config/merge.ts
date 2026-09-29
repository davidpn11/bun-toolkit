export type SourceKind = "default" | "global" | "project" | "env";

export type ValueSource = {
  kind: SourceKind;
  /** File path or env var name. */
  origin?: string;
};

export type Layer = {
  source: ValueSource;
  values: Record<string, unknown>;
};

/** Keys whose arrays accumulate across layers instead of being replaced. */
const CONCAT_KEYS = new Set(["plugins"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merges layers from lowest to highest priority and records which layer set each leaf.
 * Objects merge key by key; `plugins` concatenates; any other array or value is replaced.
 */
export function mergeLayers(layers: Layer[]): {
  values: Record<string, unknown>;
  sources: Record<string, ValueSource>;
} {
  const values: Record<string, unknown> = {};
  const sources: Record<string, ValueSource> = {};

  const walk = (
    target: Record<string, unknown>,
    incoming: Record<string, unknown>,
    prefix: string,
    source: ValueSource,
  ) => {
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(value)) {
        const existing = target[key];
        const next = isPlainObject(existing) ? existing : {};
        target[key] = next;
        walk(next, value, path, source);
      } else if (Array.isArray(value) && CONCAT_KEYS.has(path)) {
        const existing = Array.isArray(target[key]) ? (target[key] as unknown[]) : [];
        target[key] = [...existing, ...value];
        if (value.length > 0) sources[path] = source;
      } else {
        target[key] = value;
        sources[path] = source;
      }
    }
  };

  for (const layer of layers) walk(values, layer.values, "", layer.source);
  return { values, sources };
}
