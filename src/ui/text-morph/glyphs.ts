/** A run of text and how its characters are said: `quiet`, smaller and in muted ink, or plainly */
export interface MorphPart {
  text: string;
  tone?: "quiet";
}

/** One character on screen; `id` survives a change of text when the character does */
export interface Glyph {
  id: number;
  ch: string;
  tone: "quiet" | "";
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Characters as a reader sees them: an emoji or a base letter with its marks is one */
export function graphemes(text: string): string[] {
  return segmenter !== null
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);
}

/** The parts as one row of characters, each carrying its part's tone */
export function flatten(parts: readonly MorphPart[]): Omit<Glyph, "id">[] {
  return parts.flatMap((p) => graphemes(p.text).map((ch) => ({ ch, tone: p.tone ?? "" })));
}

/**
 * The next row of glyphs, keeping the ids of the characters the old row and the new one have
 * in common, in order (their longest common subsequence). "1日目 11/3" to "2日目 11/4": the
 * "日目 11/" keep their ids and only stay or slide; "1" and "3" leave, "2" and "4" arrive.
 * `mint` hands out ids for the arrivals.
 */
export function align(
  prev: readonly Glyph[],
  next: readonly Omit<Glyph, "id">[],
  mint: () => number,
): Glyph[] {
  const same = (a: Omit<Glyph, "id">, b: Omit<Glyph, "id">) => a.ch === b.ch && a.tone === b.tone;
  const n = prev.length;
  const m = next.length;
  // lcs[i][j]: the longest common run of prev[i..] and next[j..]
  const lcs = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  // past either end the run is empty
  const run = (i: number, j: number) => lcs[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const a = prev[i];
    const row = lcs[i];
    if (a === undefined || row === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      const b = next[j];
      row[j] =
        b !== undefined && same(a, b)
          ? run(i + 1, j + 1) + 1
          : Math.max(run(i + 1, j), run(i, j + 1));
    }
  }
  const out: Glyph[] = [];
  let i = 0;
  let j = 0;
  for (let b = next[j]; b !== undefined; b = next[j]) {
    const a = prev[i];
    if (a !== undefined && same(a, b)) {
      out.push({ ...b, id: a.id });
      i++;
      j++;
    } else if (a !== undefined && run(i + 1, j) >= run(i, j + 1)) {
      i++;
    } else {
      out.push({ ...b, id: mint() });
      j++;
    }
  }
  return out;
}
