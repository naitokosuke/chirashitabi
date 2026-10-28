<script setup lang="ts" vapor>
/**
 * A panel of the surface on the desk, a hairline round it: what holds a group of things (a
 * form, a list, a notice). `as` is the element it is (a form, a list, a section), so it keeps
 * its meaning; a form is sent by Enter and its submit button, `submit` says so, and the page
 * never leaves for it (a form inside a panel that is not one is its own owner's). `pad` is the room inside it: `none` for a list whose rows have their own, `sm`
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
const emit = defineEmits<{ submit: [] }>();
defineSlots<{ default(): unknown }>();

function submit(event: Event) {
  if (event.target !== event.currentTarget) return;
  event.preventDefault();
  emit("submit");
}
</script>

<template>
  <component
    :is="as"
    class="panel"
    :class="[`pad-${pad}`, { float, sunken, 'from-desktop': from === 'desktop' }]"
    @submit="submit"
  >
    <slot />
  </component>
</template>

<style scoped>
@import "../styles/media.css";

.panel {
  margin: 0;
  /* a fieldset's own edge and room give way to the panel's */
  border: 0;
  min-inline-size: 0;
  border-radius: var(--radius-7);
  background: var(--surface);
  /* the hairline drawn inside, so it takes no room */
  box-shadow: inset 0 0 0 var(--line-width) var(--line);
  list-style: none;
  /* its fields set into it, in the desk's color */
  --field-bg: var(--bg);

  &.pad-none {
    padding: 0;
  }
  &.pad-sm {
    padding: var(--space-3);
  }
  &.pad-md {
    padding: var(--space-6) var(--space-7);
  }
  &.pad-lg {
    padding: var(--space-8);
  }

  &.float {
    box-shadow:
      inset 0 0 0 var(--line-width) var(--line),
      var(--shadow-float);
  }

  &.sunken {
    background: var(--bg);
    --field-bg: var(--surface);
  }

  /* narrower than a computer: no panel, only what it holds */
  &.from-desktop {
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
