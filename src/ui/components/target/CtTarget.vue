<script setup lang="ts" vapor>
/**
 * A target locked onto a choice: four corner brackets framing `box` (from the corner of the
 * positioned parent), `pad` out from it. Given another box, each corner flies to its new
 * place on its own, quick and settling without a bounce, so on the way the frame stretches
 * and gathers again around the new choice. After React Bits' Target Cursor, which frames
 * what the pointer is over this way; here it frames what is chosen.
 *
 * `ready` once the first box has been painted, so the corners appear in place rather than
 * flying in (useIndicator).
 */
withDefaults(
  defineProps<{
    box: { x: number; y: number; width: number; height: number } | null;
    ready: boolean;
    pad?: number;
  }>(),
  { pad: 4 },
);
</script>

<template>
  <div
    aria-hidden="true"
    class="target"
    :style="box === null
      ? undefined
      : `--x: ${box.x}px; --y: ${box.y}px; --w: ${box.width}px; --h: ${box.height}px; --pad: ${pad}px`"
    :data-ready="ready || undefined"
    :data-shown="box !== null || undefined"
  >
    <span class="tl"></span>
    <span class="tr"></span>
    <span class="br"></span>
    <span class="bl"></span>
  </div>
</template>

<style scoped>
.target {
  --size: 12px;
  --stroke: 3px;
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;

  &[data-shown] {
    opacity: 1;
  }

  /* each corner: an L of ink, at its corner of the box, `--pad` out */
  > span {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    width: var(--size);
    height: var(--size);
    border: 0 solid var(--ink);
    box-sizing: border-box;
  }

  > .tl {
    border-block-start-width: var(--stroke);
    border-inline-start-width: var(--stroke);
    translate: calc(var(--x, 0) - var(--pad, 0)) calc(var(--y, 0) - var(--pad, 0));
  }
  > .tr {
    border-block-start-width: var(--stroke);
    border-inline-end-width: var(--stroke);
    translate: calc(var(--x, 0) + var(--w, 0) + var(--pad, 0) - var(--size)) calc(var(--y, 0) - var(--pad, 0));
  }
  > .br {
    border-block-end-width: var(--stroke);
    border-inline-end-width: var(--stroke);
    translate: calc(var(--x, 0) + var(--w, 0) + var(--pad, 0) - var(--size))
      calc(var(--y, 0) + var(--h, 0) + var(--pad, 0) - var(--size));
  }
  > .bl {
    border-block-end-width: var(--stroke);
    border-inline-start-width: var(--stroke);
    translate: calc(var(--x, 0) - var(--pad, 0)) calc(var(--y, 0) + var(--h, 0) + var(--pad, 0) - var(--size));
  }

  &[data-ready] > span {
    transition: translate var(--duration-lock) var(--ease-lock);
  }
}
</style>
