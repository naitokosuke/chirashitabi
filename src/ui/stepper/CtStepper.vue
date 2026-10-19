<script setup lang="ts" vapor>
/**
 * A count set a step at a time: − and + either side of it, in a field's box. `v-model` is the
 * count, kept between `min` and `max`; the slot says it in words ("4 days"), read out as it
 * changes. `label` names the whole, `fewer` and `more` its two buttons.
 */
const { min = 0, max = Infinity } = defineProps<{
  label: string;
  fewer: string;
  more: string;
  min?: number;
  max?: number;
}>();
const model = defineModel<number>({ required: true });
defineSlots<{ default(): unknown }>();

const step = (by: number) => (model.value = Math.min(max, Math.max(min, model.value + by)));
</script>

<template>
  <div role="group" :aria-label="label">
    <button type="button" :aria-label="fewer" :disabled="model <= min" @click="() => step(-1)">
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M5 12h14" />
      </svg>
    </button>
    <output aria-live="polite"><slot></slot></output>
    <button type="button" :aria-label="more" :disabled="model >= max" @click="() => step(1)">
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
div {
  display: flex;
  align-items: center;
  min-height: var(--size-field);
  border: var(--line-width) solid var(--line);
  border-radius: var(--radius-5);
  background: var(--field-bg, var(--surface));

  > button {
    display: grid;
    place-items: center;
    width: var(--size-field);
    align-self: stretch;
    border-radius: var(--radius-5);
    color: var(--ink);

    &:disabled {
      color: var(--muted);
      opacity: 0.4;
    }

    /* inside the box's edge, which would cut it off */
    &:focus-visible {
      outline-offset: calc(-1 * var(--ring-offset));
    }
  }

  > output {
    flex: 1;
    text-align: center;
    font-size: var(--font-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}
</style>
