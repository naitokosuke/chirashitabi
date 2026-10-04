<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from "vue";

/**
 * Colors to pick one of: a row of them, the chosen one ringed in ink. The ring is a drop of
 * ink behind the swatches, with the swatch's own ground punched through it. Picking another,
 * the ink flows there rather than jumping: a smaller drop lags behind the ring with a bouncier
 * ease, and a goo filter over the two (a blur, then the alpha pushed to a hard edge: the
 * metaball trick) fuses them, so on the way they stretch into one bridge and snap apart on
 * arrival. The swatches themselves sit outside the filter and stay sharp.
 *
 * The ground the swatches lie on is `--swatch-ground` (the page's background unless set), the
 * color the ring's hole shows.
 */
const props = defineProps<{ colors: readonly string[]; selected: string; label: string }>();
const emit = defineEmits<{ select: [color: string] }>();

const id = useId();
const root = useTemplateRef<HTMLElement>("root");

/** Where the ring is, from the row's corner: the middle of the chosen swatch */
const at = ref<{ x: number; y: number } | null>(null);
/** Placed once before it may flow, so it appears in place rather than flying in */
const ready = ref(false);
/** The drop is out while the ring travels, and pulls back in once it has arrived */
const bridging = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function place() {
  const n = root.value;
  const el = n?.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!n || !el) {
    at.value = null;
    return;
  }
  const a = n.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  at.value = { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
  if (!ready.value) requestAnimationFrame(() => (ready.value = true));
}
watch(
  () => props.selected,
  () => {
    place();
    bridging.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (bridging.value = false), 260);
  },
  { flush: "post" },
);

let resized: ResizeObserver | null = null;
onMounted(() => {
  place();
  if (root.value) {
    resized = new ResizeObserver(place);
    resized.observe(root.value);
  }
});
onBeforeUnmount(() => {
  resized?.disconnect();
  clearTimeout(timer);
});
</script>

<template>
  <div ref="root" class="swatches" role="group" :aria-label="label">
    <svg aria-hidden="true" class="filter" width="0" height="0" focusable="false">
      <defs>
        <filter :id="`${id}-goo`" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
          />
        </filter>
      </defs>
    </svg>
    <!-- the ink: the ring, and the drop that follows it -->
    <div
      aria-hidden="true"
      class="goo"
      :style="`filter: url(#${id}-goo)${at === null ? '' : `; --x: ${at.x}px; --y: ${at.y}px`}`"
      :data-ready="ready || undefined"
      :data-shown="at !== null || undefined"
    >
      <span class="ring"></span>
      <span class="drop" :data-out="bridging || undefined"></span>
    </div>
    <div class="row">
      <button
        v-for="(c, i) in colors"
        :key="c"
        type="button"
        :aria-pressed="selected === c"
        :aria-label="`${label} ${i + 1}`"
        :style="`--swatch: ${c}`"
        @click="() => emit('select', c)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

.swatches {
  --size: 36px;
  --gap: 12px;
  position: relative;
}

.filter {
  position: absolute;
}

.goo {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;

  &[data-shown] {
    opacity: 1;
  }

  /* both from the row's corner, translated to the chosen swatch's middle */
  > span {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    border-radius: 50%;
    background: var(--ink);
    translate: var(--x, 0) var(--y, 0);
  }

  /* the ring: a drop wide enough to show 2px of ink around the swatch and its 3px ground */
  > .ring {
    width: calc(var(--size) + 10px);
    height: calc(var(--size) + 10px);
    margin: calc((var(--size) + 10px) / -2);
  }

  /* the drop: smaller, out only on the way, and bouncier, so it lags and stretches the bridge */
  > .drop {
    width: calc(var(--size) * 0.6);
    height: calc(var(--size) * 0.6);
    margin: calc(var(--size) * -0.3);
    scale: 0;

    &[data-out] {
      scale: 1;
    }
  }

  &[data-ready] {
    > .ring {
      transition: translate calc(var(--duration-morph) * 1.3) cubic-bezier(0.16, 1, 0.3, 1);
    }
    > .drop {
      transition:
        translate calc(var(--duration-morph) * 1.7) cubic-bezier(0.34, 1.4, 0.5, 1),
        scale calc(var(--duration-morph) * 0.6) ease;
    }
  }
}

.row {
  /* positioned, so it paints over the ink behind it */
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);

  /* the color itself, on its ground, which shows as the hole in the ring */
  > button {
    width: var(--size);
    height: var(--size);
    padding: 0;
    border-radius: 50%;
    border: 0;
    background: var(--swatch);
    box-shadow: 0 0 0 3px var(--swatch-ground, var(--bg));

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 6px;
    }
  }
}
</style>
