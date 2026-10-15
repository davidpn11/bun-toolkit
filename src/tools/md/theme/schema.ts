import { z } from "zod";
import type { MdTheme } from "./types.ts";

const BASE_COLORS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray"] as const;
const BRIGHT_COLORS = ["red", "green", "yellow", "blue", "magenta", "cyan", "white"].map((c) => `${c}Bright`);
export const COLOR_NAMES: readonly string[] = [...BASE_COLORS, ...BRIGHT_COLORS];

const colorSchema = z
  .string()
  .refine(
    (value) => /^#[0-9a-f]{6}$/i.test(value) || COLOR_NAMES.includes(value),
    `Expected #rrggbb or a color name (${COLOR_NAMES.join(", ")})`,
  );

const styleSchema = z.strictObject({
  color: colorSchema.optional(),
  bg: colorSchema.optional(),
  bold: z.boolean().optional(),
  dim: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
});

const style = styleSchema.optional();
const glyph = z.string().max(8).optional();

const terminalSchema = z.strictObject({
  heading: z.array(styleSchema).min(1).optional(),
  headingRule: style,
  strong: style,
  emphasis: style,
  strikethrough: style,
  codespan: style,
  link: style,
  url: style,
  image: style,
  blockquote: style,
  rule: style,
  html: style,
  codeBlock: z.strictObject({ border: style, language: style, text: style }).optional(),
  table: z.strictObject({ border: style, header: style }).optional(),
  list: z.strictObject({ bullet: style, number: style, taskDone: style, taskTodo: style }).optional(),
  syntax: z
    .strictObject({
      keyword: style,
      type: style,
      string: style,
      literal: style,
      comment: style,
      punctuation: style,
    })
    .optional(),
  glyphs: z
    .strictObject({
      bullets: z.array(z.string().max(8)).min(1).optional(),
      heading: z.array(z.string().max(12)).min(1).optional(),
      taskDone: glyph,
      taskTodo: glyph,
      quote: glyph,
      rule: z.string().max(1).optional(),
      box: z.enum(["rounded", "square", "ascii"]).optional(),
    })
    .optional(),
});

export const themeNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Theme names use lowercase letters, digits and dashes");

export const mdThemeSchema: z.ZodType<MdTheme> = z.strictObject({
  name: themeNameSchema,
  description: z.string().optional(),
  extends: themeNameSchema.optional(),
  terminal: terminalSchema.optional(),
  css: z.string().optional(),
});
