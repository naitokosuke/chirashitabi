<script setup lang="ts" vapor>
import { onBeforeUnmount, ref, useId } from "vue";

/**
 * A button held down to act, for what cannot be taken back: pressed, it fills from its start
 * edge over `holdTime`; let go before it is full, the fill drains back and nothing happens;
 * full, it acts (`hold`) and shows `done` for a moment. A pointer holds it (and gives up by
 * drifting off it), and so do Space and Enter; Escape lets go. After React Bits' Hold Button.
 * `danger` fills it in the danger color, for something that goes for good.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    done: string;
    holdTime?: number;
    danger?: boolean;
    disabled?: boolean;
  }>(),
  { holdTime: 1200 },
);
const emit = defineEmits<{ hold: [] }>();

/** How long the fill takes to drain once let go, and how long `done` stays */
const RELEASE = 200;
const RESET = 1200;
/** How far a pointer may drift off the button before the hold is given up */
const PAD = 10;

const id = useId();
/** How full: 0 to 1 */
const p = ref(0);
const state = ref<"idle" | "holding" | "done">("idle");
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let held: { pointer: number | null; rect: DOMRect | null } | null = null;

const stop = () => {
  cancelAnimationFrame(frame);
  frame = 0;
};

/** Fills from where it is to full over what is left of `holdTime`; full, it acts */
function fill() {
  stop();
  const from = p.value;
  const left = props.holdTime * (1 - from);
  const t0 = performance.now();
  const step = (now: number) => {
    p.value = Math.min(1, from + (now - t0) / left);
    if (p.value < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    held = null;
    state.value = "done";
    emit("hold");
    timer = setTimeout(() => {
      state.value = "idle";
      p.value = 0;
    }, RESET);
  };
  frame = requestAnimationFrame(step);
}

/** Drains back to empty over RELEASE, easing out */
function drain() {
  stop();
  const from = p.value;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / RELEASE);
    p.value = from * (1 - (1 - Math.pow(1 - t, 3)));
    if (t < 1) frame = requestAnimationFrame(step);
    else frame = 0;
  };
  frame = requestAnimationFrame(step);
}

function begin(pointer: number | null, rect: DOMRect | null) {
  if (props.disabled || state.value !== "idle" || held !== null) return;
  held = { pointer, rect };
  state.value = "holding";
  fill();
}
function letGo() {
  if (held === null) return;
  held = null;
  state.value = "idle";
  drain();
}

function down(e: PointerEvent) {
  if (e.button !== 0 || !e.isPrimary) return;
  const button = e.currentTarget as HTMLElement;
  try {
    button.setPointerCapture(e.pointerId);
  } catch {
    // a pointer the browser does not hold (a synthetic one): the hold still runs, uncaptured
  }
  begin(e.pointerId, button.getBoundingClientRect());
}
function move(e: PointerEvent) {
  const r = held?.rect;
  if (!r || held?.pointer !== e.pointerId) return;
  const off =
    e.clientX < r.left - PAD ||
    e.clientX > r.right + PAD ||
    e.clientY < r.top - PAD ||
    e.clientY > r.bottom + PAD;
  if (off) letGo();
}
function up(e: PointerEvent) {
  if (held?.pointer === e.pointerId) letGo();
}
function keyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    letGo();
    return;
  }
  if (e.key !== " " && e.key !== "Enter") return;
  e.preventDefault();
  if (!e.repeat) begin(null, null);
}
function keyUp(e: KeyboardEvent) {
  if ((e.key === " " || e.key === "Enter") && held?.pointer === null) letGo();
}
/** A click comes with every press; it is the hold that acts, so a click does nothing */
const click = (e: MouseEvent) => e.preventDefault();

onBeforeUnmount(() => {
  stop();
  clearTimeout(timer);
});
</script>

<template>
  <button
    type="button"
    :disabled
    :data-state="state"
    :data-danger="danger || undefined"
    :style="`--p: ${p}`"
    :aria-labelledby="`${id}-label`"
    :aria-describedby="`${id}-hint`"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @lostpointercapture="up"
    @keydown="keyDown"
    @keyup="keyUp"
    @click="click"
  >
    <span aria-hidden="true" class="fill"></span>
    <span :id="`${id}-label`" class="label">{{ state === "done" ? done : label }}</span>
    <span :id="`${id}-hint`" class="hint">
      <slot name="hint"></slot>
    </span>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

button {
  --tone: var(--ink);
  position: relative;
  overflow: hidden;
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: 999px;
  border: 0;
  background: var(--wash);
  color: var(--ink);
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 700;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: scale var(--duration-swap) var(--ease-spring);

  &[data-danger] {
    --tone: var(--danger);
  }

  &[data-state="holding"] {
    scale: 0.97;
  }

  &:disabled {
    opacity: 0.35;
  }

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* the fill, from the start edge, as far as the hold has come; done, it is full and solid */
  > .fill {
    position: absolute;
    inset: 0;
    inset-inline-end: calc((1 - var(--p, 0)) * 100%);
    background: color-mix(in oklch, var(--tone) 32%, transparent);
    pointer-events: none;
  }
  &[data-state="done"] {
    color: var(--on-ink);

    > .fill {
      background: var(--tone);
    }
  }

  > .label {
    position: relative;
  }

  /* what a screen reader is told: that the button is held, not tapped */
  > .hint {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
</style>
