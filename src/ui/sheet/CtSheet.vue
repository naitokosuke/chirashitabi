<script setup lang="ts" vapor>
/**
 * A sheet over the views: the whole screen in the desk's color, what it holds scrolling under
 * the way back (`top`, a CtBackButton floating where a bar would be), and its act at the foot
 * (`foot`), always in reach under what scrolls, on a hairline. `as` is the element it is (a
 * form, so Enter and its submit button send it: `submit` says so, the page never leaving for
 * it). `docked` makes it a view in the stack instead
 * (the memo tab): no sheet over the others, a page's large title at the top, above the dock.
 *
 * It lays out only its three parts; how what it holds is laid out is the owner's (a column of
 * fields, two columns on a computer), in an element of its own in each slot. `--sheet-inline`
 * is the room at either side of the body and the foot, the page's margin unless the owner sets
 * it (a computer's wide column).
 */
import { useSlots } from "vue";

const { as = "div" } = defineProps<{ as?: "div" | "form"; docked?: boolean }>();
const emit = defineEmits<{ submit: [] }>();
defineSlots<{ top?(): unknown; default(): unknown; foot?(): unknown }>();
const slots = useSlots();

function submit(event: Event) {
  event.preventDefault();
  emit("submit");
}
</script>

<template>
  <component :is="as" class="sheet" :data-docked="docked || undefined" @submit="submit">
    <slot name="top"></slot>
    <div class="body"><slot></slot></div>
    <div v-if="slots.foot !== undefined" class="foot"><slot name="foot"></slot></div>
  </component>
</template>

<style scoped>
.sheet {
  position: absolute;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  flex-direction: column;
  background: var(--bg);

  /* a view in the stack like the others, not a sheet over them, above the dock */
  &[data-docked] {
    z-index: auto;
    isolation: isolate;
    padding-block-end: var(--dock-clear);

    > .body {
      padding-block-start: var(--page-top);
    }

    /* its foot sits on the dock's footprint, not on the screen's edge */
    > .foot {
      padding-block-end: 12px;
    }
  }
}

/* a sheet's page starts under its way back */
.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--top-clear) var(--sheet-inline, var(--page-margin)) 24px;
}

.foot {
  flex-shrink: 0;
  padding: 12px var(--sheet-inline, var(--page-margin))
    calc(12px + env(safe-area-inset-bottom, 0px));
  border-block-start: 1px solid var(--line);
  background: var(--bg);
}
</style>
