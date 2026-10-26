<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";

/**
 * A pill to press. Its `variant` says what kind of act it is:
 *
 * - `quiet`: an ordinary act, barely there on the desk (a wash of ink).
 * - `primary`: the one act a view is for, filled with ink.
 * - `ask`: an ask of the agent, on a dashed edge as everything of the agent's is.
 * - `blank`: something still to add, the outline of a button, dashed.
 * - `text`: a word inside a line (on a toast, a band, a paper), told apart by its underline
 *   and written in the line's own ink and size; the line's height is its tap's.
 *
 * `size` `lg` is the act at the foot of a form, as tall as a field; `sm` is a `text` button
 * among a line's small notes, as small as they are. `float` lifts it off the desk with a
 * tool's shadow, for a button floating over a view. `type` `submit` sends the form it is in. While
 * what it set going is under way (`busy`), a dot breathes before its words. With `label`, the
 * slot is a glyph alone and `label` names it: the button is a round, a thumb's width.
 * `danger` is an act that takes something away: `primary` fills it with the danger's color;
 * `quiet` keeps it quieter still, no wash and grey words, the danger's color only on intent;
 * `text` writes it in the line's quieter ink, the same way. `focus()` puts the keyboard on it.
 * `softDisabled` is off but keeps the keyboard (`aria-disabled`), for a button whose act is
 * under way and which the keyboard is not to fall off: it looks off as a disabled one does, and
 * a press on it does nothing, so no `click` is emitted.
 */
const {
  variant = "quiet",
  size = "md",
  type = "button",
  disabled = false,
  softDisabled = false,
} = defineProps<{
  variant?: "quiet" | "primary" | "ask" | "blank" | "text";
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  softDisabled?: boolean;
  busy?: boolean;
  label?: string;
  danger?: boolean;
  float?: boolean;
}>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();

const el = useTemplateRef<HTMLButtonElement>("el");
defineExpose({ focus: () => el.value?.focus() });

function onClick(e: MouseEvent) {
  if (softDisabled) e.preventDefault();
  else emit("click", e);
}
</script>

<template>
  <button
    ref="el"
    :type
    :disabled
    :class="[
      variant,
      `size-${size}`,
      { glyph: label !== undefined, danger, float, off: disabled || softDisabled },
    ]"
    :aria-disabled="softDisabled || undefined"
    :aria-busy="busy || undefined"
    :aria-label="label"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: var(--tap);
  padding: 0 var(--space-7);
  border-radius: var(--radius-pill);
  background: var(--wash);
  color: var(--ink);
  font-size: var(--font-sm);
  font-weight: 700;
  white-space: nowrap;
  transition:
    background-color var(--duration-swap) ease,
    box-shadow var(--duration-swap) ease;

  /* off, disabled or soft-disabled alike: every variant's off look keys on `.off` */
  &.off {
    opacity: 0.35;
  }

  /* waiting (on the agent, on the Worker): a dot breathing before the words, which say what is happening */
  &[aria-busy="true"]::before {
    content: "";
    width: var(--size-dot-sm);
    height: var(--size-dot-sm);
    border-radius: 50%;
    background: currentColor;
    animation: breathe 1s ease-in-out infinite alternate;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &.size-lg {
    min-height: var(--size-field);
    padding: 0 var(--space-10);
    font-size: var(--font-base);
  }

  /* a glyph alone: round, as wide as it is tall */
  &.glyph {
    min-width: var(--tap);
    padding: 0;
  }

  &.quiet {
    @media (--can-hover) {
      &:not(.off):hover {
        background: color-mix(in oklch, var(--ink) 12%, transparent);
      }
    }
  }

  &.primary {
    background: var(--ink);
    color: var(--on-ink);

    @media (--can-hover) {
      &:not(.off):hover {
        box-shadow: var(--shadow-float);
      }
    }
  }

  &.ask {
    padding: 0 var(--space-6);
    background: var(--surface);
    border: var(--line-width) dashed color-mix(in oklch, var(--ink) 30%, var(--line));

    /* the agent cannot be asked now: said by the words going grey, the edge stays */
    &.off {
      opacity: 1;
      color: var(--muted);
    }
  }

  &.blank {
    background: transparent;
    border: var(--line-width-drawn) dashed color-mix(in oklch, var(--ink) 28%, transparent);
    color: var(--muted);

    @media (--can-hover) {
      &:not(.off):hover {
        color: var(--ink);
      }
    }
  }

  &.text {
    /* a thumb's height to hit, taken back out of the line so the line keeps its own */
    margin-block: calc((1lh - var(--tap)) / 2);
    padding: 0 var(--space-2);
    border-radius: var(--radius-2);
    background: none;
    color: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: var(--underline-offset);

    /* among a line's small notes: as small as they are */
    &.size-sm {
      font-size: var(--font-xs);
    }
  }

  /* over the desk, lifted off it as the tools are */
  &.float {
    box-shadow: var(--shadow-tool);
  }

  &.danger {
    &.primary {
      background: var(--danger);
    }

    &.quiet {
      background: transparent;
      color: var(--muted);

      @media (--can-hover) {
        &:not(.off):hover {
          background: var(--wash);
          color: var(--danger);
        }
      }
    }

    /* in the line's quieter ink, the danger's color only on intent */
    &.text {
      color: var(--muted);

      @media (--can-hover) {
        &:not(.off):hover {
          color: var(--danger);
        }
      }
    }
  }
}

@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}
</style>
