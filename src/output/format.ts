const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** `1536` -> `1.5 KB`. Uses 1024 steps, matching what file managers show. */
export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : "";
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 2 : 1;
  return `${sign}${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Percentage change from `before` to `after`, positive when `after` is smaller. */
export function reduction(before: number, after: number): number {
  if (before <= 0) return 0;
  return ((before - after) / before) * 100;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "function") return "[function]";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.map(formatValue).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatChange(percent: number): string {
  return percent >= 0 ? `-${percent.toFixed(1)}%` : `+${Math.abs(percent).toFixed(1)}%`;
}

export function changeTone(percent: number): "success" | "warning" | "error" {
  if (percent > 20) return "success";
  return percent >= 0 ? "warning" : "error";
}
