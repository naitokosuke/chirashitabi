/**
 * A tag that could go on a memo being written: how many notes have it, and how likely Clef
 * found it fitting (null when Clef has not judged it). `isNew` is a tag no note has yet
 */
export interface TagOption {
  name: string;
  count: number;
  p: number | null;
  isNew: boolean;
}

/** Pairs of letters: Japanese has no spaces, so a tag is matched by its pieces, not its words */
const pairs = (s: string) => Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2));

/**
 * How much of a tag the text names, from 0 to 1: 1 when the tag is written in it, else the
 * share of the tag's pairs of letters it holds ("食べ物" in "食べたい" is a half). Less than half
 * is chance ("Beer" in "sweets"), so it is none
 */
export function mention(tag: string, text: string): number {
  const t = tag.toLowerCase();
  const s = text.toLowerCase();
  if (t === "") return 0;
  if (s.includes(t)) return 1;
  const ps = pairs(t);
  if (ps.length < 2) return 0;
  const share = ps.filter((p) => s.includes(p)).length / ps.length;
  return share >= 0.5 ? share : 0;
}

/**
 * The tags in the order they fit the text, as it is typed: what the text names and what Clef
 * found likely count alike, and how often a tag is used breaks the rest. Free, so it can run on
 * every keystroke
 */
export function rankTags(options: readonly TagOption[], text: string): TagOption[] {
  const most = Math.max(1, ...options.map((o) => o.count));
  const score = (o: TagOption) => mention(o.name, text) + (o.p ?? 0) + (0.1 * o.count) / most;
  return options
    .map((o) => ({ o, s: score(o) }))
    .sort((a, b) => b.s - a.s)
    .map(({ o }) => o);
}

/** Clef finds a tag this likely or more fitting; the Worker draws the same line (worker/clef.ts) */
export const FITS_AT = 0.5;

/** A tag the text names, or Clef found likely: shown as fitting, not only as one in use */
export const fits = (o: TagOption, text: string) =>
  (o.p !== null && o.p >= FITS_AT) || mention(o.name, text) > 0;

/**
 * How alike two texts are, from 0 to 1, by the pairs of letters they share: a few letters more
 * leave them alike, a rewrite does not ("桃園空港のコンビニ" and "空港のコンビニで日本の製品を探す"
 * are about half alike)
 */
export function likeness(a: string, b: string): number {
  const pa = pairs(a.toLowerCase());
  const pb = new Set(pairs(b.toLowerCase()));
  if (pa.length + pb.size === 0) return 1;
  const shared = new Set(pa.filter((p) => pb.has(p))).size;
  return (2 * shared) / (new Set(pa).size + pb.size);
}
