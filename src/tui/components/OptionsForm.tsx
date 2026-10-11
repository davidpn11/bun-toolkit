import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { describeExpected, inspectSchema } from "../../cli/schema-info.ts";
import { formatValue } from "../../output/format.ts";
import { colors, icons } from "../../output/palette.ts";
import type { FormField } from "../form-fields.ts";
import { useNavigation, useScreenActive } from "../navigation.tsx";

export type OptionsFormProps = {
  fields: FormField[];
  initial: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  submitLabel?: string;
  isFocused?: boolean;
};

export const OPTIONS_FORM_HINTS = [
  { key: "↑↓", label: "field" },
  { key: "←→", label: "change" },
  { key: "enter", label: "edit/run" },
];

function clampNumber(value: number, field: FormField): number {
  let next = value;
  if (field.min !== undefined) next = Math.max(field.min, next);
  if (field.max !== undefined) next = Math.min(field.max, next);
  return next;
}

export function OptionsForm({
  fields,
  initial,
  onSubmit,
  submitLabel = "Run",
  isFocused = true,
}: OptionsFormProps) {
  const screenActive = useScreenActive();
  const nav = useNavigation();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [row, setRow] = useState(0);
  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitRow = fields.length;
  const field = fields[row];

  const { setInputLocked } = nav;
  useEffect(() => {
    setInputLocked(editing !== undefined);
    return () => setInputLocked(false);
  }, [editing, setInputLocked]);

  const set = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((current) => {
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  };

  const adjust = (f: FormField, direction: 1 | -1) => {
    const current = values[f.key];
    if (f.kind === "number") {
      const base = typeof current === "number" ? current : (f.min ?? 0);
      set(f.key, clampNumber(base + direction * f.step, f));
    } else if (f.kind === "enum" && f.options) {
      const i = f.options.indexOf(String(current));
      const next = (i + direction + f.options.length) % f.options.length;
      set(f.key, f.options[i === -1 ? 0 : next]);
    } else if (f.kind === "boolean") {
      set(f.key, !current);
    }
  };

  const commitDraft = (f: FormField) => {
    const text = draft.trim();
    if (text === "") set(f.key, undefined);
    else if (f.kind === "number") set(f.key, Number.isNaN(Number(text)) ? text : Number(text));
    else set(f.key, text);
    setEditing(undefined);
  };

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const parsed: Record<string, unknown> = {};
    for (const f of fields) {
      const result = f.schema.safeParse(values[f.key]);
      if (result.success) parsed[f.key] = result.data;
      else nextErrors[f.key] = `Expected ${describeExpected(inspectSchema(f.schema))}`;
    }
    setErrors(nextErrors);
    const firstBad = fields.findIndex((f) => nextErrors[f.key]);
    if (firstBad >= 0) setRow(firstBad);
    else onSubmit(parsed);
  };

  useInput(
    (input, key) => {
      if (editing && field) {
        if (key.return) commitDraft(field);
        else if (key.escape) setEditing(undefined);
        else if (key.backspace || key.delete) setDraft((d) => d.slice(0, -1));
        else if (input && !key.ctrl && !key.meta) setDraft((d) => d + input);
        return;
      }
      if (key.upArrow || input === "k") setRow((r) => Math.max(0, r - 1));
      else if (key.downArrow || input === "j" || key.tab) setRow((r) => Math.min(submitRow, r + 1));
      else if (row === submitRow && key.return) submit();
      else if (field && (key.leftArrow || key.rightArrow)) adjust(field, key.rightArrow ? 1 : -1);
      else if (field?.kind === "boolean" && (input === " " || key.return)) adjust(field, 1);
      else if (field?.kind === "enum" && (input === " " || key.return)) adjust(field, 1);
      else if (field && key.return && (field.kind === "number" || field.kind === "text")) {
        setDraft(values[field.key] === undefined ? "" : String(values[field.key]));
        setEditing(field.key);
      }
    },
    { isActive: isFocused && screenActive },
  );

  const labelWidth = Math.max(0, ...fields.map((f) => f.label.length));

  return (
    <Box flexDirection="column">
      {fields.map((f, i) => {
        const active = i === row;
        const value = values[f.key];
        const shown =
          editing === f.key
            ? `${draft}▏`
            : f.kind === "boolean"
              ? value
                ? "● on"
                : "○ off"
              : value === undefined
                ? "—"
                : formatValue(value);
        const arrows = active && editing !== f.key && f.kind !== "text" ? ["‹ ", " ›"] : ["  ", "  "];
        return (
          <Box key={f.key} flexDirection="column">
            <Box columnGap={1}>
              <Text color={colors.accent}>{active ? icons.pointer : " "}</Text>
              <Text color={active ? undefined : colors.muted}>{f.label.padEnd(labelWidth)}</Text>
              <Text color={active ? colors.accent : undefined} bold={active}>
                {arrows[0]}
                {shown}
                {arrows[1]}
              </Text>
              {active ? <Text color={colors.muted}>{f.description}</Text> : null}
            </Box>
            {errors[f.key] ? (
              <Text color={colors.error}>
                {"   "}
                {icons.error} {errors[f.key]}
              </Text>
            ) : null}
          </Box>
        );
      })}
      <Box marginTop={1} columnGap={1}>
        <Text color={colors.accent}>{row === submitRow ? icons.pointer : " "}</Text>
        <Text color={row === submitRow ? colors.accent : colors.muted} bold inverse={row === submitRow}>
          {` ▶ ${submitLabel} `}
        </Text>
      </Box>
    </Box>
  );
}
