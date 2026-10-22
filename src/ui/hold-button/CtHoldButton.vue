<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from "vue";

/**
 * A button held down to act, for what cannot be taken back, after React Bits' Hold Button:
 * pressed, it fills from its start edge over `holdTime`, the fill's leading edge a soft wave,
 * and whatever it says turns to the fill's color as the fill passes over it; let go before it
 * is full, the fill drains back and nothing happens; full, it acts (`hold`), rings once and
 * shows `done` for a moment. A pointer holds it (and gives up by drifting off it), and so do
 * Space and Enter; Escape, the window losing focus, the page being hidden or the button
 * turning `disabled` lets go. A screen reader, which can only click, starts the fill with one
 * click and stops it with the next (see `click`).
 * `danger` fills it in the danger color, for something that goes for good. With an `icon`,
 * the icon is what is shown and `label` / `done` are what a screen reader is told.
 *
 * Its `variant` is how it rests: `quiet`, a wash of ink; `primary`, filled with ink, filling a
 * step lighter (the yes of two); `outline`, a hairline, filling in muted ink (the no of two).
 * On paper (.on-paper) all three are in the paper's ink.
 */
const {
  label,
  done,
  holdTime = 1200,
  danger,
  disabled,
  variant = "quiet",
} = defineProps<{
  label: string;
  done: string;
  holdTime?: number;
  danger?: boolean;
  disabled?: boolean;
  variant?: "quiet" | "primary" | "outline";
}>();
const emit = defineEmits<{ hold: [] }>();
const slots = defineSlots<{ icon?(): unknown; hint?(): unknown }>();

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
/**
 * What is holding it: a key, a screen reader's click, or a pointer, with where the button was
 * when it went down
 */
type Hold = { by: "key" } | { by: "click" } | { by: "pointer"; id: number; rect: DOMRect };
let held: Hold | null = null;
let observer: ResizeObserver | null = null;

// Everything below runs on a press, a frame or a timer, never while rendering on a server; each
// says so, so it holds should the app ever render there
function stop() {
  if (import.meta.env.SSR) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

/** Anything that takes the person away lets go */
function hidden() {
  if (import.meta.env.SSR) return;
  if (document.hidden) letGo();
}
function watchAway(on: boolean) {
  if (import.meta.env.SSR) return;
  const how = on ? "addEventListener" : "removeEventListener";
  window[how]("blur", letGo);
  document[how]("visibilitychange", hidden);
}

/** Fills from where it is to full over what is left of `holdTime`; full, it acts */
function fill() {
  if (import.meta.env.SSR) return;
  stop();
  const from = p.value;
  const left = holdTime * (1 - from);
  const t0 = performance.now();
  const step = (now: number) => {
    if (import.meta.env.SSR) return;
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
    // done, it takes no new hold until it is reset; going away clears this timer
    timer = setTimeout(reset, RESET);
  };
  frame = requestAnimationFrame(step);
}
/** After a while done, it is ready again and drains */
function reset() {
  state.value = "idle";
  drain();
}

/** Drains back to empty over RELEASE, easing out */
function drain() {
  if (import.meta.env.SSR) return;
  stop();
  const from = p.value;
  const t0 = performance.now();
  const step = (now: number) => {
    if (import.meta.env.SSR) return;
    const t = Math.min(1, (now - t0) / RELEASE);
    p.value = from * Math.pow(1 - t, 3);
    if (t < 1) frame = requestAnimationFrame(step);
    else frame = 0;
  };
  frame = requestAnimationFrame(step);
}

function begin(hold: Hold) {
  if (disabled || state.value !== "idle" || held !== null) return;
  held = hold;
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
/** Turned off mid-hold (its owner went offline, say), it lets go rather than act */
watch(
  () => disabled,
  (off) => {
    if (off) letGo();
  },
);

function down(e: PointerEvent) {
  const button = e.currentTarget;
  if (e.button !== 0 || !e.isPrimary || !(button instanceof HTMLElement)) return;
  try {
    button.setPointerCapture(e.pointerId);
  } catch {
    // a pointer the browser does not hold (a synthetic one): the hold still runs, uncaptured
  }
  begin({ by: "pointer", id: e.pointerId, rect: button.getBoundingClientRect() });
}
function move(e: PointerEvent) {
  if (held?.by !== "pointer" || held.id !== e.pointerId) return;
  const r = held.rect;
  const off =
    e.clientX < r.left - PAD ||
    e.clientX > r.right + PAD ||
    e.clientY < r.top - PAD ||
    e.clientY > r.bottom + PAD;
  if (off) letGo();
}
function up(e: PointerEvent) {
  if (held?.by === "pointer" && held.id === e.pointerId) letGo();
}
function keyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    letGo();
    return;
  }
  if (e.key !== " " && e.key !== "Enter") return;
  e.preventDefault();
  if (!e.repeat) begin({ by: "key" });
}
function keyUp(e: KeyboardEvent) {
  if (e.key !== " " && e.key !== "Enter") return;
  // the key's own click (Firefox's comes on Space's keyup) is held back, as on keydown
  e.preventDefault();
  if (held?.by === "key") letGo();
}
/**
 * A click comes with every press, and it is the hold that acts, so a pointer's click (one it
 * counts: `detail` 1 or more) does nothing, and the keys' clicks are held back above. A click
 * no pointer counted (`detail` 0) is a screen reader's double tap or Enter, which cannot be
 * held: it starts the fill as a hold would, and the next such click, Escape or leaving lets go.
 */
function click(e: MouseEvent) {
  e.preventDefault();
  if (e.detail !== 0) return;
  if (held?.by === "click") letGo();
  else begin({ by: "click" });
}
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
    :class="[state, variant, { danger }]"
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
    <!-- and, once it has acted, that it has (its name changing is not announced) -->
    <span class="unseen" role="status">{{ state === "done" ? done : "" }}</span>
  </button>
</template>

<style scoped>
@import "../styles/media.css";

button {
  --tone: var(--ink);
  --radius: var(--radius-pill);
  /* how far the wave on the fill's edge swings */
  --wave: var(--space-2);
  position: relative;
  isolation: isolate;
  display: inline-grid;
  place-items: center;
  min-height: var(--tap);
  padding: 0 var(--space-7);
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

  &.primary {
    --tone: color-mix(in oklab, var(--ink), var(--on-ink) 30%);
    background: var(--ink);
    color: var(--on-ink);
  }

  &.outline {
    --tone: var(--muted);
    background: var(--surface);
    color: var(--muted);
    box-shadow: inset 0 0 0 var(--line-width-drawn) color-mix(in oklch, var(--ink) 35%, transparent);
  }

  &.danger {
    --tone: var(--danger);
  }

  &.holding {
    scale: 0.97;

    @media (--reduced-motion) {
      scale: none;
    }
  }

  /* done: its ring goes out (.pulse) */
  &.done > .pulse {
    animation: ring 600ms cubic-bezier(0.23, 1, 0.32, 1) forwards;

    @media (--reduced-motion) {
      animation: none;
    }
  }

  &:disabled {
    opacity: 0.35;
  }

  &:focus-visible {
    outline: var(--ring-width) solid var(--tone);
    outline-offset: var(--ring-offset);
  }
}

.face {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
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
    box-shadow: 0 0 0 var(--space-5) color-mix(in oklch, var(--tone) 0%, transparent);
  }
}

.unseen {
  position: absolute;
  width: var(--space-px);
  height: var(--space-px);
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
