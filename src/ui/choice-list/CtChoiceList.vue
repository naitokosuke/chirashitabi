<script setup lang="ts" generic="T extends { key: string; label: string; detail?: string }" vapor>
/**
 * What a search found, to choose one of (places, say): a line each, its name and, under it on
 * one line, what tells it apart (where it is). A tap is the choice (`choose`, with the item).
 * `dashed` draws them on a dashed edge, as everything the agent offers is. They sit in a field's
 * ground (`--field-bg`), as a CtInput does.
 */
defineProps<{ items: readonly T[]; dashed?: boolean }>();
const emit = defineEmits<{ choose: [item: T] }>();
</script>

<template>
  <ul :class="{ dashed }">
    <li v-for="it in items" :key="it.key">
      <button type="button" @click="() => emit('choose', it)">
        <span>{{ it.label }}</span>
        <small v-if="it.detail !== undefined">{{ it.detail }}</small>
      </button>
    </li>
  </ul>
</template>

<style scoped>
@import "/src/ui/styles/media.css";
ul {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;

  button {
    display: grid;
    gap: var(--space-1);
    width: 100%;
    min-height: var(--tap);
    padding: var(--space-4) var(--space-6);
    border: var(--line-width) solid var(--line);
    border-radius: var(--radius-5);
    background: var(--field-bg, var(--surface));
    color: var(--ink);
    text-align: start;

    > span {
      font-size: var(--font-md);
      font-weight: 700;
    }

    > small {
      overflow: hidden;
      font-size: var(--font-xs);
      color: var(--muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (--can-hover) {
      &:hover {
        border-color: var(--ink);
      }
    }
  }

  &.dashed button {
    border-style: dashed;
    border-color: color-mix(in oklch, var(--ink) 30%, var(--line));

    @media (--can-hover) {
      &:hover {
        border-style: solid;
        border-color: var(--ink);
      }
    }
  }
}
</style>
