<script setup lang="ts" vapor>
/** A single row of chips that scrolls sideways and fades at the end, so a row that keeps going says so */
defineSlots<{ default(): unknown }>();
</script>

<template>
  <div class="ct-chip-row"><slot></slot></div>
</template>

<style scoped>
.ct-chip-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-inline: 16px 28px;
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);

  &::-webkit-scrollbar {
    display: none;
  }
}
</style>
