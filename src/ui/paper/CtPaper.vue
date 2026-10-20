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
 * - `row`: a person's sticky laid level along a page's row, as wide as the column (a plan in
 *   the booklet, an item on its checklist). `tab` is a fold of the same paper, a shade darker,
 *   down its start edge (the plan's time); what is written goes beside it.
 *
 * `wide` cuts it as wide as the column it lies in, for a slip read on a page rather than
 * pinned on the desk (the booklet's draft of a day). `stamp` presses a word in the paper's ink
 * across its top end corner, a little askew (done). `faded` lets the stock fade toward white
 * and the paper lie flatter, for one that is only a maybe; its ink stays at full.
 *
 * `selected` frames it in ink, `lifted` raises it as a finger holds it. What is put on it (a
 * CtButton, a CtChip) is drawn in the paper's ink, not the desk's (tokens.css, .on-paper).
 */
const {
  variant = "note",
  paper = "var(--paper-white)",
  selected,
  lifted,
  wide,
  stamp,
  faded,
} = defineProps<{
  variant?: "note" | "proposal" | "print" | "row";
  paper?: string;
  selected?: boolean;
  lifted?: boolean;
  wide?: boolean;
  stamp?: string;
  faded?: boolean;
}>();
const slots = defineSlots<{
  strip?(): unknown;
  picture?(): unknown;
  tab?(): unknown;
  default(): unknown;
  foot?(): unknown;
}>();
</script>

<template>
  <div
    class="paper"
    :class="[variant, { selected, lifted, wide: wide || variant === 'row', faded }]"
    :style="`--paper: ${paper}`"
  >
    <!-- what is on it is written in the paper's ink (on-paper); its frame stays the desk's -->
    <div v-if="variant === 'proposal'" class="strip on-paper">
      <b class="label"><slot name="strip" /></b>
    </div>
    <div v-if="variant === 'print'" class="picture on-paper"><slot name="picture" /></div>
    <div v-if="variant === 'row' && slots.tab !== undefined" class="tab on-paper">
      <slot name="tab" />
    </div>
    <div class="body on-paper"><slot /></div>
    <div v-if="variant !== 'row'" class="foot on-paper"><slot name="foot" /></div>
    <span v-if="stamp !== undefined" class="stamp">{{ stamp }}</span>
  </div>
</template>

<style scoped>
@import "../styles/media.css";

/* one shadow and one ink on paper in every cut; the outline says which cut */
.paper {
  position: relative;
  /* its own block, so the first margin inside stays inside */
  display: flow-root;
  box-sizing: border-box;
  width: var(--size-paper);
  border-radius: var(--radius-3);
  background: var(--paper);
  color: var(--paper-ink);
  box-shadow: var(--shadow-paper);
  transition: box-shadow var(--duration-swap) ease;

  @media (--reduced-motion) {
    transition: none;
  }

  /* picked: framed in ink */
  &.selected {
    box-shadow:
      var(--shadow-float),
      0 0 0 var(--ring-width) var(--ink);
  }

  /* held: off the desk, its shadow fallen far and soft; still framed if it is the one picked */
  &.lifted {
    box-shadow: var(--shadow-lift);
    transition-timing-function: var(--ease-spring);
  }

  &.wide {
    width: auto;
  }

  &.lifted.selected {
    box-shadow:
      var(--shadow-lift),
      0 0 0 var(--ring-width) var(--ink);
  }

  /* the agent's slip is cut square: a machine's paper, never a person's soft corner */
  &.proposal {
    border-radius: 0;

    > .body:not(:empty) {
      padding-block-start: var(--space-5);
    }

    /* a slip's answers, side by side across it */
    > .foot {
      gap: var(--space-4);
      padding-block-start: var(--space-5);
    }
  }

  /* a print: a person's soft corner, wider, the picture in a wide mount */
  &.print {
    width: var(--size-print);

    > .body:not(:empty) {
      padding: var(--space-6) var(--space-8) 0;
    }

    > .foot {
      padding: var(--space-4) var(--space-8) var(--space-8);

      &:empty {
        padding: 0 0 var(--space-8);
      }
    }
  }

  /* a row: level along the column, the tab down its start edge, the words beside it */
  &.row {
    display: flex;

    > .body {
      flex: 1;
      min-width: 0;
      padding: var(--space-5) var(--space-6);
    }
  }

  /* only a maybe: the stock fades toward white (in either theme, paper stays light), flatter */
  &.faded {
    background: color-mix(in oklch, var(--paper) 45%, var(--paper-white));
    box-shadow: var(--shadow-tool);

    > .tab {
      background: color-mix(in oklch, var(--paper) 70%, var(--paper-white));
    }
  }
}

/* the fold down a row's start edge: lightness only, so a yellow fold stays yellow */
.tab {
  flex-shrink: 0;
  width: var(--size-fold);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-3);
  border-radius: var(--radius-3) 0 0 var(--radius-3);
  background: oklch(from var(--paper) calc(l - 0.045) c h);
}

/* a word pressed in the paper's ink across the top end corner */
.stamp {
  position: absolute;
  inset-block-start: var(--space-3);
  inset-inline-end: var(--space-5);
  padding: var(--space-px) var(--space-4);
  border: var(--ring-width) solid var(--paper-ink);
  border-radius: var(--radius-2);
  color: var(--paper-ink);
  font-size: var(--font-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  transform: rotate(-10deg);
  opacity: 0.7;
  pointer-events: none;
}

/* a slip's strip: what it is, perforated where it would tear off */
.strip {
  display: flex;
  align-items: center;
  height: var(--size-strip);
  padding-inline: var(--space-6);
  background: color-mix(in oklch, var(--paper-ink) 5%, transparent);
  border-block-end: var(--line-width) dashed color-mix(in oklch, var(--paper-ink) 35%, transparent);
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
  padding: var(--space-6) var(--space-6) 0;

  /* nothing written: no room for it either */
  &:empty {
    padding: 0;
  }
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
  padding: var(--space-4) var(--space-6) var(--space-6);

  &:empty {
    padding: 0 0 var(--space-6);
  }
}

/* a print: the picture in an ink-edged frame, a wide mount of the paper round it */
.picture {
  margin: var(--space-8) var(--space-8) 0;
  border-radius: var(--radius-1);
  overflow: hidden;
  background: color-mix(in oklch, var(--paper-ink) 6%, transparent);
  outline: var(--line-width) solid color-mix(in oklch, var(--paper-ink) 35%, transparent);
}
</style>
