<script setup lang="ts" vapor>
/**
 * A row a finger slides left to show its actions behind it, as a phone's list does (iOS's
 * trailing swipe actions, Ionic's `ion-item-sliding`). Only a finger slides it: a mouse, a
 * keyboard and a screen reader get the row's actions some other way, which the row's owner
 * provides. `open` is kept by the owner, so one row is open at a time; `toggle` asks for it.
 * While open, a tap on the row, a touch anywhere else or a scroll closes it.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";

import { axisOf, resist, settlesOpen } from "./swipe";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: [open: boolean] }>();

const root = useTemplateRef<HTMLElement>("root");
const set = useTemplateRef<HTMLElement>("set");
const content = useTemplateRef<HTMLElement>("content");

/** The actions' own width: how far the row goes to show them, measured when a finger lands */
const width = ref(0);
/** Where a finger holds the row; null when it is not */
const drag = ref<number | null>(null);
const offset = computed(() => drag.value ?? (props.open ? -width.value : 0));
const style = computed(() => ({ "--offset": `${offset.value}px` }));

let start: { id: number; x: number; y: number; from: number } | null = null;
let axis: "x" | "y" | null = null;
let last = { x: 0, t: 0 };
let velocity = 0;
/**
 * A slide may end in a click on whatever was under the finger, which is not a tap: one coming
 * this soon (ms, on the events' clock) after a slide is dropped. Any later click is meant.
 */
const AFTER_SLIDE = 400;
let slidUntil = -Infinity;

function down(e: PointerEvent) {
  if (e.pointerType !== "touch" || !e.isPrimary || set.value === null) return;
  width.value = set.value.offsetWidth;
  start = { id: e.pointerId, x: e.clientX, y: e.clientY, from: props.open ? -width.value : 0 };
  axis = null;
  last = { x: e.clientX, t: e.timeStamp };
  velocity = 0;
}

function move(e: PointerEvent) {
  if (start === null || e.pointerId !== start.id) return;
  const dx = e.clientX - start.x;
  if (axis === null) {
    axis = axisOf(dx, e.clientY - start.y);
    if (axis === null) return;
    // an upright move is the list scrolling: the browser has it (touch-action), and an open row shuts
    if (axis === "y") {
      start = null;
      if (props.open) emit("toggle", false);
      return;
    }
    root.value?.setPointerCapture(e.pointerId);
  }
  const dt = e.timeStamp - last.t;
  if (dt > 0) velocity = (e.clientX - last.x) / dt;
  last = { x: e.clientX, t: e.timeStamp };
  drag.value = resist(start.from + dx, width.value);
}

function up(e: PointerEvent) {
  if (start === null || e.pointerId !== start.id) return;
  start = null;
  if (drag.value === null) return;
  slidUntil = e.timeStamp + AFTER_SLIDE;
  emit("toggle", settlesOpen(drag.value, width.value, velocity));
  drag.value = null;
}

function cancel() {
  start = null;
  drag.value = null;
}

/** Native and capturing, so the row's own links and buttons never see a click it takes */
function click(e: MouseEvent) {
  const slid = e.timeStamp < slidUntil;
  const onContent = content.value?.contains(e.target as Node) ?? false;
  if (!slid && !(props.open && onContent)) return;
  e.preventDefault();
  e.stopPropagation();
  if (slid) slidUntil = -Infinity;
  else emit("toggle", false);
}

/** A touch outside the row while it is open */
function outside(e: PointerEvent) {
  if (!(root.value?.contains(e.target as Node) ?? false)) emit("toggle", false);
}

watch(
  () => props.open,
  (open) => {
    if (open) document.addEventListener("pointerdown", outside, true);
    else document.removeEventListener("pointerdown", outside, true);
  },
);
onMounted(() => root.value?.addEventListener("click", click, true));
onBeforeUnmount(() => {
  root.value?.removeEventListener("click", click, true);
  document.removeEventListener("pointerdown", outside, true);
});
</script>

<template>
  <div
    ref="root"
    class="row"
    :data-sliding="drag !== null || undefined"
    :style
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
  >
    <!-- behind the row, at its right end; out of reach until it is shown -->
    <div class="actions" :inert="offset === 0">
      <div ref="set" class="set">
        <slot name="actions"></slot>
      </div>
    </div>
    <div ref="content" class="content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.row {
  position: relative;
  /* the list still scrolls under a finger; sideways is the row's */
  touch-action: pan-y;
}

.content {
  translate: var(--offset) 0;
}

/* as wide as the row has gone: the actions are uncovered from the right, as if lying under it */
.actions {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: calc(-1 * var(--offset));
  overflow: hidden;
  display: flex;
  justify-content: flex-end;
}

/* the actions at their own width, or stretched when the row is pulled past it */
.set {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  min-inline-size: 100%;
  inline-size: max-content;
  padding-inline-start: 10px;
}

/* let go, it settles; under a finger it follows at once */
.row:not([data-sliding]) {
  > .content {
    transition: translate var(--duration-swap) var(--ease-morph);
  }

  > .actions {
    transition: inline-size var(--duration-swap) var(--ease-morph);
  }
}
</style>
