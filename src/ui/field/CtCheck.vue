<script setup lang="ts" vapor>
import CtCheckbox from "./CtCheckbox.vue";

/**
 * A box to tick with its words beside it, the whole line its label, a thumb's height to tap
 * (an item on a checklist, "keep writing"). `v-model` is whether it is ticked; `id` is the
 * box's, for anything else that names it. The words take the line's ink and size; `quiet`
 * sets them small and muted, for a choice beside a form's act.
 */
const model = defineModel<boolean>({ default: false });
defineProps<{ id?: string; quiet?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <label class="check" :for="id" :class="{ quiet }">
    <CtCheckbox :id v-model="model" />
    <slot />
  </label>
</template>

<style scoped>
.check {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-height: var(--tap);

  &.quiet {
    gap: var(--space-4);
    font-size: var(--font-sm);
    color: var(--muted);
  }
}
</style>
