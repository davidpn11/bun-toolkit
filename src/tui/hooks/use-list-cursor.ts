import { useCallback, useEffect, useState } from "react";

export type ListCursor = {
  index: number;
  offset: number;
  limit: number;
  move(delta: number): void;
  moveTo(index: number): void;
};

export function useListCursor(
  length: number,
  limit: number,
  options: { initial?: number; isDisabled?: (index: number) => boolean } = {},
): ListCursor {
  const { isDisabled } = options;
  const [index, setIndex] = useState(() => clamp(options.initial ?? 0, length));
  const [offset, setOffset] = useState(0);

  const place = useCallback(
    (next: number) => {
      setIndex(next);
      setOffset((current) => {
        if (next < current) return next;
        if (next >= current + limit) return next - limit + 1;
        return Math.min(current, Math.max(0, length - limit));
      });
    },
    [length, limit],
  );

  useEffect(() => {
    if (index >= length) place(Math.max(0, length - 1));
  }, [index, length, place]);

  const move = useCallback(
    (delta: number) => {
      if (length === 0) return;
      let next = index;
      const step = delta > 0 ? 1 : -1;
      for (let remaining = Math.abs(delta); remaining > 0; remaining--) {
        let candidate = next + step;
        while (candidate >= 0 && candidate < length && isDisabled?.(candidate)) candidate += step;
        if (candidate < 0 || candidate >= length) break;
        next = candidate;
      }
      place(next);
    },
    [index, length, isDisabled, place],
  );

  const moveTo = useCallback((target: number) => place(clamp(target, length)), [length, place]);

  return { index: clamp(index, length), offset, limit, move, moveTo };
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)));
}
