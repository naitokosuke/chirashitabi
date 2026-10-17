<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, useId, useSlots, useTemplateRef } from "vue";

/**
 * A button held down to act, for what cannot be taken back, after React Bits' Hold Button:
 * pressed, it fills from its start edge over `holdTime`, the fill's leading edge a soft wave,
 * and whatever it says turns to the fill's color as the fill passes over it; let go before it
 * is full, the fill drains back and nothing happens; full, it acts (`hold`), rings once and
 * shows `done` for a moment. A pointer holds it (and gives up by drifting off it), and so do
 * Space and Enter; Escape, the window losing focus or the page being hidden lets go.
 * `danger` fills it in the danger color, for something that goes for good. With an `icon`,
 * the icon is what is shown and `label` / `done` are what a screen reader is told.
 */
const {
  label,
  done,
  holdTime = 1200,
  danger,
  disabled,
} = defineProps<{
  label: string;
  done: string;
  holdTime?: number;
  danger?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ hold: [] }>();
const slots = useSlots();

/** How long the fill takes to drain once let go, and how long `done` stays */
const RELEASE = 200;
const RESET = 1200;
/** How far a pointer may drift off the button before the hold is given up */
const PAD = 10;

const id = useId();
const el = useTemplateRef<HTMLButtonElement>("el");
/** How full: 0 to 1 */
const p = ref(0);
const state = ref<"idle" | "holding" | "done">("idle");
/** The button's size, for the wave on the fill's edge */
const size = ref({ w: 0, h: 0 });
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let held: { pointer: number | null; rect: DOMRect | null } | null = null;
let observer: ResizeObserver | null = null;

const stop = () => {
  cancelAnimationFrame(frame);
  frame = 0;
};

/** Anything that takes the person away lets go */
const away = () => letGo();
const hidden = () => {
  if (document.hidden) letGo();
};
function watchAway(on: boolean) {
  const how = on ? "addEventListener" : "removeEventListener";
  window[how]("blur", away);
  document[how]("visibilitychange", hidden);
}

/** Fills from where it is to full over what is left of `holdTime`; full, it acts */
function fill() {
  stop();
  const from = p.value;
  const left = holdTime * (1 - from);
  const t0 = performance.now();
  const step = (now: number) => {
    p.value = Math.min(1, from + (now - t0) / left);
    if (p.value < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = 0;
    held = null;
    watchAway(false);
    state.value = "done";
    emit("hold");
    timer = setTimeout(() => {
      state.value = "idle";
      drain();
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
    p.value = from * Math.pow(1 - t, 3);
    if (t < 1) frame = requestAnimationFrame(step);
    else frame = 0;
  };
  frame = requestAnimationFrame(step);
}

function begin(pointer: number | null, rect: DOMRect | null) {
  if (disabled || state.value !== "idle" || held !== null) return;
  held = { pointer, rect };
  state.value = "holding";
  watchAway(true);
  fill();
}
function letGo() {
  if (held === null) return;
  held = null;
  watchAway(false);
  state.value = "idle";
  drain();
}

function down(e: PointerEvent) {
  const button = e.currentTarget;
  if (e.button !== 0 || !e.isPrimary || !(button instanceof HTMLElement)) return;
  try {
    button.setPointerCapture(e.pointerId);
  } catch {
    // a pointer the browser does not hold (a synthetic one): the hold still runs, uncaptured
  }
  begin(e.pointerId, button.getBoundingClientRect());
}
function move(e: PointerEvent) {
  if (held === null || held.rect === null || held.pointer !== e.pointerId) return;
  const r = held.rect;
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
/** A long press is this button's, not the system's menu */
const menu = (e: MouseEvent) => e.preventDefault();

onMounted(() => {
  const button = el.value;
  if (button === null) return;
  const measure = () => {
    size.value = { w: button.offsetWidth, h: button.offsetHeight };
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(button);
});
onBeforeUnmount(() => {
  stop();
  clearTimeout(timer);
  watchAway(false);
  observer?.disconnect();
});
</script>

<template>
  <button
    ref="el"
    type="button"
    :disabled
    :data-state="state"
    :data-danger="danger || undefined"
    :style="`--p: ${p}; --w: ${size.w}px; --h: ${size.h}px`"
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
    @contextmenu="menu"
  >
    <!-- done: one ring going out from it -->
    <span aria-hidden="true" class="pulse"></span>
    <!-- what it says, at rest -->
    <span aria-hidden="true" class="face">
      <slot v-if="slots.icon !== undefined" name="icon"></slot>
      <template v-else>{{ state === "done" ? done : label }}</template>
    </span>
    <!-- the fill, and the same words in the fill's color under it, cut to how far it has come;
         its leading edge a wave -->
    <span aria-hidden="true" class="clip">
      <span class="fill">
        <span class="face">
          <slot v-if="slots.icon !== undefined" name="icon"></slot>
          <template v-else>{{ state === "done" ? done : label }}</template>
        </span>
      </span>
      <span class="crest">
        <span class="face">
          <slot v-if="slots.icon !== undefined" name="icon"></slot>
          <template v-else>{{ state === "done" ? done : label }}</template>
        </span>
      </span>
    </span>
    <!-- what a screen reader is told: what it does, and that it is held, not tapped -->
    <span :id="`${id}-label`" class="unseen">{{ state === "done" ? done : label }}</span>
    <span :id="`${id}-hint`" class="unseen">
      <slot name="hint"></slot>
    </span>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

button {
  --tone: var(--ink);
  --radius: 999px;
  /* how far the wave on the fill's edge swings */
  --wave: 5px;
  position: relative;
  isolation: isolate;
  display: inline-grid;
  place-items: center;
  min-height: var(--tap);
  padding: 0 14px;
  border-radius: var(--radius);
  border: 0;
  background: var(--wash);
  color: var(--ink);
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 700;
  /* held, not tapped: no system highlight, callout, selection or scroll under the finger */
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: scale var(--duration-swap) var(--ease-spring);

  @media (--reduced-motion) {
    transition: none;
  }

  &[data-danger] {
    --tone: var(--danger);
  }

  &[data-state="holding"] {
    scale: 0.97;

    @media (--reduced-motion) {
      scale: none;
    }
  }

  /* done: its ring goes out (.pulse) */
  &[data-state="done"] > .pulse {
    animation: ring 600ms cubic-bezier(0.23, 1, 0.32, 1) forwards;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &:disabled {
    opacity: 0.35;
  }

  &:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 2px;
  }
}

.face {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* the fill's layers, over what it says (later in the button, so on top), cut to the button's own round outline (never a square box) */
.clip {
  position: absolute;
  inset: 0;
  clip-path: inset(0 round var(--radius));
  pointer-events: none;
}

.fill,
.crest {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--tone);
  color: var(--on-ink);
}

/* as far as the hold has come from the start edge; the wave covers the cut */
.fill {
  clip-path: inset(
    0 calc((1 - var(--p)) * (100% + 0.75 * var(--wave)) - var(--p) * 0.25 * var(--wave)) 0 0
  );

  &:dir(rtl) {
    clip-path: inset(
      0 0 0 calc((1 - var(--p)) * (100% + 0.75 * var(--wave)) - var(--p) * 0.25 * var(--wave))
    );
  }
}

/* the leading edge: a column of soft waves that rides with the fill and rolls as it goes */
.crest {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='200' viewBox='0 0 20 200' preserveAspectRatio='none'%3E%3Cpath d='M0 0H10C18 8 18 25.3 10 33.3S2 58.7 10 66.7S18 92 10 100S2 125.3 10 133.3S18 158.7 10 166.7S2 192 10 200H0Z'/%3E%3C/svg%3E");
  mask-repeat: repeat-y;
  mask-size: var(--wave) calc(var(--h) * 2);
  mask-position: calc(-1 * var(--wave) + var(--p) * (var(--w) + var(--wave)))
    calc(-1 * var(--p) * 1.2 * var(--h));

  @media (--reduced-motion) {
    visibility: hidden;
  }

  &:dir(rtl) {
    visibility: hidden;
  }
}

/* done: one ring in its color, going out and fading */
.pulse {
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  pointer-events: none;
  opacity: 0;
}

@keyframes ring {
  from {
    opacity: 1;
    box-shadow: 0 0 0 0 color-mix(in oklch, var(--tone) 45%, transparent);
  }
  to {
    opacity: 0;
    box-shadow: 0 0 0 10px color-mix(in oklch, var(--tone) 0%, transparent);
  }
}

.unseen {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
