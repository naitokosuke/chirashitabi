<script setup lang="ts" vapor>
/**
 * A band across the whole screen in ink, saying what holds for every view at once (that this
 * device is cut off), with what to do about it in `action`. Its words sit at its foot, so a band
 * that also covers the status bar reads under it. Where it is fixed and how tall it is are the
 * owner's.
 */
defineSlots<{ default(): unknown; action?(): unknown }>();
</script>

<template>
  <div class="banner">
    <span><slot></slot></span>
    <slot name="action"></slot>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 0 12px 4px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: var(--font-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
