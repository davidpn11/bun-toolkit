import { homedir } from "node:os";
import { basename, dirname, sep } from "node:path";
import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "../../output/format.ts";
import { colors, icons } from "../../output/palette.ts";
import { type DirEntry, listDirectory } from "../../shared/fs.ts";
import { useListCursor } from "../hooks/use-list-cursor.ts";

export type FileBrowserProps = {
  root: string;
  /** Only show files with these extensions (lowercase, with dot). */
  extensions?: readonly string[];
  multiple?: boolean;
  onSubmit: (paths: string[]) => void;
  /** Called with the highlighted file (not directories), e.g. to show a preview panel. */
  onHighlight?: (entry: DirEntry | undefined) => void;
  limit?: number;
  isFocused?: boolean;
};

export const FILE_BROWSER_HINTS = [
  { key: "↑↓", label: "move" },
  { key: "enter", label: "open/pick" },
  { key: "←", label: "up" },
  { key: "space", label: "select" },
  { key: "a", label: "all" },
  { key: ".", label: "hidden" },
];

function tildify(path: string): string {
  const home = homedir();
  return path === home ? "~" : path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

type Row = DirEntry & { parent?: boolean };

/**
 * Keyboard file picker. Enter opens a directory or picks the highlighted file (or the current
 * selection, when there is one). ← / backspace goes to the parent directory.
 */
export function FileBrowser({
  root,
  extensions,
  multiple = false,
  onSubmit,
  onHighlight,
  limit = 12,
  isFocused = true,
}: FileBrowserProps) {
  const [dir, setDir] = useState(root);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // After going up a level, highlight the directory we came from.
  const [focusName, setFocusName] = useState<string>();
  // Keyed by content so callers can pass an inline array without re-reading the disk every render.
  const extensionKey = extensions?.join(",");

  const { rows, error } = useMemo<{ rows: Row[]; error?: string }>(() => {
    try {
      const list = listDirectory(dir, { extensions, showHidden });
      const parent = dirname(dir);
      const parentRow: Row = { name: "..", path: parent, isDirectory: true, size: 0, parent: true };
      return { rows: parent !== dir ? [parentRow, ...list] : list };
    } catch (e) {
      return { rows: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [dir, extensionKey, showHidden]);

  const cursor = useListCursor(rows.length, limit);
  const current = rows[cursor.index];

  useEffect(() => {
    const found = focusName ? rows.findIndex((r) => r.name === focusName && !r.parent) : -1;
    cursor.moveTo(found >= 0 ? found : 0);
  }, [dir]);

  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;
  const highlightedFile = current && !current.isDirectory ? current : undefined;
  useEffect(() => {
    onHighlightRef.current?.(highlightedFile);
  }, [highlightedFile?.path]);

  const enter = (path: string, focus?: string) => {
    setFocusName(focus);
    setDir(path);
  };

  const goUp = () => {
    const parent = dirname(dir);
    if (parent !== dir) enter(parent, basename(dir));
  };

  const toggle = (entry: Row) => {
    if (!multiple || entry.isDirectory) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  };

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") cursor.move(-1);
      else if (key.downArrow || input === "j") cursor.move(1);
      else if (key.pageUp) cursor.move(-limit);
      else if (key.pageDown) cursor.move(limit);
      else if (key.home) cursor.moveTo(0);
      else if (key.end) cursor.moveTo(rows.length - 1);
      else if (key.leftArrow || key.backspace || key.delete) goUp();
      else if (key.rightArrow && current?.isDirectory) {
        if (current.parent) goUp();
        else enter(current.path);
      } else if (input === " " && current) {
        toggle(current);
        cursor.move(1);
      } else if (input === "a" && multiple) {
        const files = rows.filter((r) => !r.isDirectory).map((r) => r.path);
        setSelected((prev) => (files.every((f) => prev.has(f)) ? new Set() : new Set([...prev, ...files])));
      } else if (input === ".") {
        setShowHidden((v) => !v);
      } else if (key.return && current) {
        if (current.parent) goUp();
        else if (current.isDirectory) enter(current.path);
        else onSubmit(selected.size > 0 ? [...selected] : [current.path]);
      }
    },
    { isActive: isFocused },
  );

  const visible = rows.slice(cursor.offset, cursor.offset + limit);
  const below = Math.max(0, rows.length - cursor.offset - limit);

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>{tildify(dir)}</Text>
        {multiple && selected.size > 0 ? <Text color={colors.accent}>{selected.size} selected</Text> : null}
      </Box>
      {error ? <Text color={colors.error}>{error}</Text> : null}
      {!error && rows.length === 0 ? <Text color={colors.muted}>Empty directory</Text> : null}
      {cursor.offset > 0 ? <Text color={colors.muted}> ↑ {cursor.offset} more</Text> : null}
      {visible.map((row, i) => {
        const active = cursor.offset + i === cursor.index;
        const isSelected = selected.has(row.path);
        const mark = row.isDirectory ? " " : multiple ? (isSelected ? "◉" : "○") : " ";
        return (
          <Box key={row.path + String(row.parent)} columnGap={1}>
            <Text color={colors.accent}>{active ? icons.pointer : " "}</Text>
            <Text color={isSelected ? colors.success : colors.muted}>{mark}</Text>
            <Box flexGrow={1}>
              <Text color={active ? colors.accent : undefined} bold={active}>
                {row.isDirectory && !row.parent ? `${row.name}/` : row.name}
              </Text>
            </Box>
            {!row.isDirectory ? <Text color={colors.muted}>{formatBytes(row.size)}</Text> : null}
          </Box>
        );
      })}
      {below > 0 ? <Text color={colors.muted}> ↓ {below} more</Text> : null}
    </Box>
  );
}
