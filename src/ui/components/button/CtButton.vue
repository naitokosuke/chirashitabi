<script setup lang="ts" vapor>
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
 * `size` `lg` is the act at the foot of a form, as tall as a field. `type` `submit` sends the form it is in. While
 * what it set going is under way (`busy`), a dot breathes before its words.
 */
const {
  variant = "quiet",
  size = "md",
  type = "button",
} = defineProps<{
  variant?: "quiet" | "primary" | "ask" | "blank" | "text";
  size?: "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <button
    :type
    :disabled
    :data-variant="variant"
    :data-size="size"
    :aria-busy="busy || undefined"
    @click="(e) => emit('click', e)"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font-size: var(--font-sm);
  font-weight: 700;
  white-space: nowrap;
  transition:
    background-color var(--duration-swap) ease,
    box-shadow var(--duration-swap) ease;

  &:disabled {
    opacity: 0.35;
  }

  /* waiting (on the agent, on the Worker): a dot breathing before the words, which say what is happening */
  &[aria-busy="true"]::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: breathe 1s ease-in-out infinite alternate;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &[data-size="lg"] {
    min-height: 46px;
    padding: 0 20px;
    font-size: var(--font-base);
  }

  &[data-variant="quiet"] {
    @media (--can-hover) {
      &:not(:disabled):hover {
        background: color-mix(in oklch, var(--ink) 12%, transparent);
      }
    }
  }

  &[data-variant="primary"] {
    background: var(--ink);
    color: var(--on-ink);

    @media (--can-hover) {
      &:not(:disabled):hover {
        box-shadow: var(--shadow-float);
      }
    }
  }

  &[data-variant="ask"] {
    padding: 0 12px;
    background: var(--surface);
    border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));

    /* the agent cannot be asked now: said by the words going grey, the edge stays */
    &:disabled {
      opacity: 1;
      color: var(--muted);
    }
  }

  &[data-variant="blank"] {
    background: transparent;
    border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
    color: var(--muted);

    @media (--can-hover) {
      &:not(:disabled):hover {
        color: var(--ink);
      }
    }
  }

  &[data-variant="text"] {
    /* a thumb's height to hit, taken back out of the line so the line keeps its own */
    margin-block: calc((1lh - var(--tap)) / 2);
    padding: 0 4px;
    border-radius: 4px;
    background: none;
    color: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
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
