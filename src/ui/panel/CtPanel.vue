<script setup lang="ts" vapor>
/**
 * A panel of the surface on the desk, a hairline round it: what holds a group of things (a
 * form, a list, a notice). `as` is the element it is (a form, a list, a section), so it keeps
 * its meaning. `pad` is the room inside it: `none` for a list whose rows have their own, `sm`
 * for a menu of buttons, `md` for most, `lg` for a form. `float` lifts it over what it covers
 * (a menu, a panel opened from a button). `sunken` is a panel set into a panel (a flight in the
 * trip's settings), in the desk's color, its fields back on the surface. The fields on a panel
 * are set into it, in the desk's color (`--field-bg`). `from="desktop"` draws
 * it only on a computer, where it stands beside a column; narrower, what it holds lies on the
 * desk with the rest.
 */
const { as = "div", pad = "md" } = defineProps<{
  as?: "div" | "section" | "article" | "form" | "fieldset" | "ul" | "ol" | "p";
  pad?: "none" | "sm" | "md" | "lg";
  float?: boolean;
  sunken?: boolean;
  from?: "desktop";
}>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <component
    :is="as"
    class="panel"
    :data-pad="pad"
    :data-float="float || undefined"
    :data-sunken="sunken || undefined"
    :data-from="from"
  >
    <slot></slot>
  </component>
</template>

<style scoped>
@import "../styles/media.css";

.panel {
  margin: 0;
  /* a fieldset's own edge and room give way to the panel's */
  border: 0;
  min-inline-size: 0;
  border-radius: 14px;
  background: var(--surface);
  /* the hairline drawn inside, so it takes no room */
  box-shadow: inset 0 0 0 1px var(--line);
  list-style: none;
  /* its fields set into it, in the desk's color */
  --field-bg: var(--bg);

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

  &[data-sunken] {
    background: var(--bg);
    --field-bg: var(--surface);
  }

  /* narrower than a computer: no panel, only what it holds */
  &[data-from="desktop"] {
    @media not (--desktop) {
      padding: 0;
      border-radius: 0;
      background: none;
      box-shadow: none;
      --field-bg: var(--surface);
    }
  }
}
</style>
