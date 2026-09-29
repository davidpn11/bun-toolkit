/** Bun's accent color (`--c-accent` on bun.com). */
export const ACCENT = "#FF1F8F";

/** Colors for Ink. Everything except the accent uses the terminal's own palette. */
export const colors = {
  accent: ACCENT,
  success: "green",
  error: "red",
  warning: "yellow",
  muted: "gray",
} as const;

export const icons = {
  success: "✔",
  error: "✖",
  warning: "⚠",
  info: "ℹ",
  debug: "·",
  bullet: "•",
  arrow: "→",
  pointer: "❯",
  logo: "◆",
} as const;
