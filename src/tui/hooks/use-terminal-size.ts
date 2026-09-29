import { useStdout } from "ink";
import { useEffect, useState } from "react";

export type TerminalSize = {
  columns: number;
  rows: number;
};

/** Current terminal size, updated on resize. Falls back to 80×24 when the stream does not report one. */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const read = (): TerminalSize => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
  const [size, setSize] = useState(read);

  useEffect(() => {
    const onResize = () => setSize(read());
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}
