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
 * `selected` frames it in ink, `lifted` raises it as a finger holds it. What is put on it (a
 * CtButton, a CtChip) is drawn in the paper's ink, not the desk's (tokens.css, data-paper).
 */
const {
  variant = "note",
  paper = "var(--paper-white)",
  selected,
  lifted,
} = defineProps<{
  variant?: "note" | "proposal" | "print";
  paper?: string;
  selected?: boolean;
  lifted?: boolean;
}>();
</script>

<template>
  <div
    class="paper"
    :data-variant="variant"
    :data-selected="selected || undefined"
    :data-lifted="lifted || undefined"
    :style="`--paper: ${paper}`"
  >
    <!-- what is on it is written in the paper's ink (data-paper); its frame stays the desk's -->
    <div v-if="variant === 'proposal'" class="strip" data-paper>
      <b class="label"><slot name="strip"></slot></b>
    </div>
    <div v-if="variant === 'print'" class="picture" data-paper><slot name="picture"></slot></div>
    <div class="body" data-paper><slot></slot></div>
    <div class="foot" data-paper><slot name="foot"></slot></div>
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

  /* picked: framed in ink */
  &[data-selected] {
    box-shadow:
      var(--shadow-float),
      0 0 0 2px var(--ink);
  }

  /* held: off the desk, its shadow fallen far and soft; still framed if it is the one picked */
  &[data-lifted] {
    box-shadow: var(--shadow-lift);
    transition-timing-function: var(--ease-spring);
  }

  &[data-lifted][data-selected] {
    box-shadow:
      var(--shadow-lift),
      0 0 0 2px var(--ink);
  }

  /* the agent's slip is cut square: a machine's paper, never a person's soft corner */
  &[data-variant="proposal"] {
    border-radius: 0;

    > .body:not(:empty) {
      padding-block-start: 10px;
    }

    /* a slip's answers, side by side across it */
    > .foot {
      gap: 8px;
      padding-block-start: 10px;
    }
  }

  /* a print: a person's soft corner, wider, the picture in a wide mount */
  &[data-variant="print"] {
    width: 220px;

    > .body:not(:empty) {
      padding: 12px 16px 0;
    }

    > .foot {
      padding: 8px 16px 16px;

      &:empty {
        padding: 0 0 16px;
      }
    }
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

  /* nothing written: no room for it either */
  &:empty {
    padding: 0;
  }
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
</style>
