<script setup lang="ts" vapor>
/**
 * A piece of paper on the desk. Its stock is whoever it came from (`paper`, the member's
 * paper), so whose it is reads off the whole sheet; its outline says what it is:
 *
 * - `note`: a person's sticky, with a soft corner. What is written goes in the default slot, a
 *   stamp under it (a day) in `foot`.
 * - `proposal`: a slip from the agent, cut square, with a strip across the top saying what it
 *   is (the `strip` slot), its lower edge perforated; `foot` holds what to do with it.
 * - `print`: a picture brought onto the desk (a page's, or a photo of a note's), the soft
 *   corner of a person's paper with a wide mount round the picture (`picture`) in an ink-edged
 *   frame, the words under it (default slot) and a stamp (`foot`).
 *
 * `selected` frames it in ink, `lifted` raises it as a finger holds it.
 */
withDefaults(
  defineProps<{
    variant?: "note" | "proposal" | "print";
    paper?: string;
    selected?: boolean;
    lifted?: boolean;
  }>(),
  { variant: "note", paper: "var(--paper-white)" },
);
</script>

<template>
  <div
    class="paper"
    :data-variant="variant"
    :data-selected="selected || undefined"
    :data-lifted="lifted || undefined"
    :style="`--paper: ${paper}`"
  >
    <div v-if="variant === 'proposal'" class="strip">
      <b class="label"><slot name="strip"></slot></b>
    </div>
    <div v-if="variant === 'print'" class="picture"><slot name="picture"></slot></div>
    <div class="body"><slot></slot></div>
    <div class="foot"><slot name="foot"></slot></div>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

/* one shadow and one ink on paper in every cut; the outline says which cut */
.paper {
  position: relative;
  /* its own block, so the first margin inside stays inside */
  display: flow-root;
  box-sizing: border-box;
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

  /* the agent's slip is cut square: a machine's paper, never a person's soft corner */
  &[data-variant="proposal"] {
    border-radius: 0;
  }

  /* a print: a person's soft corner, wider, the picture in a wide mount */
  &[data-variant="print"] {
    width: 220px;
  }
}

/* a slip's strip: what it is, perforated where it would tear off */
.strip {
  display: flex;
  align-items: center;
  height: 20px;
  padding-inline: 12px;
  background: color-mix(in oklch, var(--paper-ink) 5%, transparent);
  border-block-end: 1px dashed color-mix(in oklch, var(--paper-ink) 35%, transparent);
}

.label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--font-2xs);
  font-weight: 700;
  line-height: 1;
  color: var(--paper-ink);
}

.body {
  padding: 12px 12px 0;

  &:empty {
    display: none;
  }
}

.paper[data-variant="proposal"] > .body {
  padding-block-start: 10px;
}

/* a slip's answers, side by side across it */
.paper[data-variant="proposal"] > .foot {
  gap: 8px;
  padding-block-start: 10px;
}

.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 8px 12px 12px;

  &:empty {
    padding: 0 0 12px;
  }
}

/* a print: the picture in an ink-edged frame, a wide mount of the paper round it */
.picture {
  margin: 16px 16px 0;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in oklch, var(--paper-ink) 6%, transparent);
  outline: 1px solid color-mix(in oklch, var(--paper-ink) 35%, transparent);
}

.paper[data-variant="print"] > .body {
  padding: 12px 16px 0;
}

.paper[data-variant="print"] > .foot {
  padding: 8px 16px 16px;

  &:empty {
    padding: 0 0 16px;
  }
}
</style>
