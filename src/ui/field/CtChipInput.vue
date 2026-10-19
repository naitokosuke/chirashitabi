<script setup lang="ts" vapor>
/**
 * A field that gathers words as chips: the chips already given (CtChip size="sm", in the slot)
 * and a line to write the next one, in one box that takes the focus ring as a whole. `v-model`
 * holds the word being written; Enter or leaving the line says `commit`, and the owner turns it
 * into a chip and empties the line. `id` and `placeholder` go to the line, for its CtField.
 */
const model = defineModel<string>({ required: true });
defineProps<{ id?: string; placeholder?: string }>();
const emit = defineEmits<{ commit: [] }>();
defineSlots<{ default(): unknown }>();

function commit() {
  emit("commit");
}
</script>

<template>
  <div class="box">
    <slot></slot>
    <input
      :id
      v-model="model"
      enterkeyhint="done"
      :placeholder
      @keydown.enter.prevent="commit"
      @blur="commit"
    />
  </div>
</template>

<style scoped>
.box {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 46px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--field-bg, var(--surface));

  /* the box is the field: it takes the focus ring for the input inside it */
  &:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  > input {
    flex: 1;
    min-width: 80px;
    height: 32px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: var(--font-base);
    color: var(--ink);
    outline: none;

    &::placeholder {
      color: var(--muted);
    }
  }
}
</style>
