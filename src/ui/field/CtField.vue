<script setup lang="ts" vapor>
/**
 * A field of a form: its name over it, then what fills it in (the default slot: a `CtInput`, a
 * calendar, a row of chips) and anything said under it. With `for`, the name is the label of
 * the control with that id; without, it only heads what is under it. The `note` slot is what
 * the field waits for, said after its name in ink.
 */
defineProps<{ label: string; for?: string }>();
defineSlots<{ default(): unknown; note?(): unknown }>();
</script>

<template>
  <div>
    <label v-if="$props.for !== undefined" :for="$props.for">{{ label }}<em><slot name="note"></slot></em></label>
    <span v-else>{{ label }}<em><slot name="note"></slot></em></span>
    <slot></slot>
  </div>
</template>

<style scoped>
div {
  display: grid;
  gap: 6px;
  min-width: 0;

  > label,
  > span {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);

    > em {
      margin-inline-start: 8px;
      font-style: normal;
      font-weight: 400;
      color: var(--ink);
    }
  }
}
</style>
