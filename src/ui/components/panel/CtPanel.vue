<script setup lang="ts" vapor>
/**
 * A panel of the surface on the desk, a hairline round it: what holds a group of things (a
 * form, a list, a notice). `as` is the element it is (a form, a list, a section), so it keeps
 * its meaning. `pad` is the room inside it: `none` for a list whose rows have their own, `sm`
 * for a menu of buttons, `md` for most, `lg` for a form. `float` lifts it over what it covers
 * (a menu, a panel opened from a button).
 */
const { as = "div", pad = "md" } = defineProps<{
  as?: "div" | "section" | "article" | "form" | "ul" | "ol" | "p";
  pad?: "none" | "sm" | "md" | "lg";
  float?: boolean;
}>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <component :is="as" class="panel" :data-pad="pad" :data-float="float || undefined">
    <slot></slot>
  </component>
</template>

<style scoped>
.panel {
  margin: 0;
  border-radius: 14px;
  background: var(--surface);
  /* the hairline drawn inside, so it takes no room */
  box-shadow: inset 0 0 0 1px var(--line);
  list-style: none;

  &[data-pad="none"] {
    padding: 0;
  }
  &[data-pad="sm"] {
    padding: 6px;
  }
  &[data-pad="md"] {
    padding: 12px 14px;
  }
  &[data-pad="lg"] {
    padding: 16px;
  }

  &[data-float] {
    box-shadow:
      inset 0 0 0 1px var(--line),
      var(--shadow-float);
  }
}
</style>
