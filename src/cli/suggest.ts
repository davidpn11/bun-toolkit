/** Edit distance where swapping two adjacent letters counts as one edit (`ifno` -> `info` is 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, at(i - 2, j - 2) + 1);
      (d[i] as number[])[j] = best;
    }
  }
  return at(a.length, b.length);
}

/**
 * Closest candidate to `input`, or undefined if nothing is close enough to be a plausible typo.
 * Prefix matches win (`conf` -> `config`).
 */
export function suggest(input: string, candidates: Iterable<string>): string | undefined {
  const needle = input.toLowerCase();
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const hay = candidate.toLowerCase();
    if (needle.length >= 2 && hay.startsWith(needle)) return candidate;
    const score = levenshtein(needle, hay);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  const threshold = Math.max(1, Math.floor(needle.length / 3));
  return bestScore <= threshold ? best : undefined;
}

export function didYouMean(input: string, candidates: Iterable<string>, format = (s: string) => `"${s}"`) {
  const match = suggest(input, candidates);
  return match ? `Did you mean ${format(match)}?` : undefined;
}
