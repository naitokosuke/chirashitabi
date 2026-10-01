<script setup lang="ts" vapor>
import { computed } from "vue";

/** `src` is an imported .svg; its shape masks a box painted in the current text color */
const props = defineProps<{ src: string; size: number }>();
// Vapor (3.6 RC) passes the attrs of a component onto one rendered in its slot: in
// <CtTabBar class="nav">, each tab's icon got `nav` too. An icon takes no attrs anyway
defineOptions({ inheritAttrs: false });

const style = computed(() => ({
  "--src": `url(${JSON.stringify(props.src)})`,
  "--size": `${props.size}px`,
}));
</script>

<template>
  <span aria-hidden="true" class="icon" :style="style"></span>
</template>

<style scoped>
.icon {
  display: inline-block;
  flex-shrink: 0;
  inline-size: var(--size);
  block-size: var(--size);
  background: currentColor;
  mask: var(--src) center / contain no-repeat;
}
</style>
