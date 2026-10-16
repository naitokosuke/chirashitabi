<script setup lang="ts" vapor>
/**
 * A piece of paper on the desk, in one of three cuts that share one size, one corner and one
 * shadow, so everything on the desk reads as one family:
 *
 * - `note`: a sticky. A strip of adhesive across the top, the stock a shade deeper there, with
 *   a dot in the strip for whose hand it came from. What is written goes in the default slot;
 *   `foot` is for a stamp under it (a day).
 * - `proposal`: a slip from the agent. The same paper on white stock, its strip perforated
 *   (a dashed edge under it) and naming who proposed it (the `strip` slot); `foot` holds what
 *   to do with it.
 * - `print`: a page brought in from outside, deliberately unlike the two: a picture (the
 *   `picture` slot) in a mount of the stock edged in ink, with a margin under it (`margin`)
 *   where a print's caption goes, and the dot at its end.
 *
 * `paper` is the stock (a CSS color; white by default), `who` the color of whoever it came
 * from (the dot; none without it), `selected` frames it in ink, `lifted` raises it as a
 * finger holds it.
 */
withDefaults(
  defineProps<{
    variant?: "note" | "proposal" | "print";
    paper?: string;
    who?: string;
    selected?: boolean;
    lifted?: boolean;
  }>(),
  { variant: "note", paper: "var(--paper-white)", who: undefined },
);
</script>

<template>
  <div
    :data-variant="variant"
    :data-selected="selected || undefined"
    :data-lifted="lifted || undefined"
    :style="`--paper: ${paper}; --who: ${who ?? 'transparent'}`"
  >
    <template v-if="variant === 'print'">
      <figure><slot name="picture"></slot></figure>
      <footer><slot name="margin"></slot><span v-if="who !== undefined" aria-hidden="true"></span></footer>
    </template>
    <template v-else>
      <header><slot name="strip"></slot><span v-if="who !== undefined" aria-hidden="true"></span></header>
      <div><slot></slot></div>
      <footer><slot name="foot"></slot></footer>
    </template>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

/* one size, one corner, one shadow, ink on paper, in every cut */
div {
  position: relative;
  width: 164px;
  border-radius: 6px;
  background: var(--paper);
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  transition: box-shadow var(--duration-swap) ease;

  @media (--reduced-motion) {
    transition: none;
  }

  &[data-lifted] {
    box-shadow: var(--shadow-lift);
    transition: none;
  }

  /* picked: framed in ink */
  &[data-selected] {
    box-shadow:
      var(--shadow-float),
      0 0 0 2px var(--ink);
  }

  /* whose hand: a dot, never a fill */
  span {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--who);
  }

  /* ---- a sticky, and a slip: the strip, the words, the foot ---- */
  > header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 18px;
    padding: 0 8px 0 12px;
    border-radius: 6px 6px 0 0;
    /* the strip: the stock a shade deeper, where it holds to the desk */
    background: color-mix(in oklch, var(--paper-ink) 9%, transparent);
    font-size: var(--font-2xs);
    font-weight: 700;
    line-height: 1;
    color: var(--paper-muted);
    white-space: nowrap;

    > span {
      margin-inline-start: auto;
    }
  }

  > div {
    padding: 9px 12px 0;
  }

  > footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px 12px;
  }

  /* a slip: white stock, the strip's lower edge perforated */
  &[data-variant="proposal"] > header {
    background: color-mix(in oklch, var(--paper-ink) 5%, transparent);
    border-block-end: 1px dashed color-mix(in oklch, var(--paper-ink) 35%, transparent);
    color: var(--paper-ink);
  }

  /* ---- a print: a picture in a mount, a caption in the margin ---- */
  &[data-variant="print"] {
    padding: 8px 8px 7px;
    border-radius: 3px;
    outline: 1px solid color-mix(in oklch, var(--paper-ink) 35%, transparent);
    outline-offset: -1px;

    > figure {
      margin: 0;
      border-radius: 2px;
      overflow: hidden;
      background: color-mix(in oklch, var(--paper-ink) 6%, transparent);
    }

    > footer {
      min-height: 18px;
      margin-block-start: 6px;
      padding: 0 1px;
      font-size: var(--font-2xs);
      font-weight: 700;
      line-height: 1;
      color: var(--paper-muted);
      white-space: nowrap;

      > span {
        margin-inline-start: auto;
      }
    }
  }
}
</style>
