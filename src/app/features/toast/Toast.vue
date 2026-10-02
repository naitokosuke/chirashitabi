<script setup lang="ts" vapor>
import { useI18n } from "../../i18n/useI18n";

import { useToast } from "./useToast";

const toast = useToast();
const i18n = useI18n();
</script>

<template>
  <div v-if="toast.current" class="toast" role="status">
    <span>{{ toast.current.text }}</span>
    <button v-if="toast.current.undo" type="button" @click="() => toast.undo()">{{ i18n.t("canvas.undo") }}</button>
  </div>
</template>

<style scoped>
/* Above the view and its write stamp's row, below a sheet: wherever the user is, a write confirms there */
.toast {
  position: absolute;
  inset-inline: 16px 90px;
  inset-block-end: calc(var(--navh) + 92px);
  z-index: var(--z-menu);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--ink);
  color: var(--bg);
  font-size: var(--font-md);
  font-weight: 700;
  box-shadow: var(--shadow-float);

  & button {
    flex-shrink: 0;
    white-space: nowrap;
    min-height: var(--tap);
    color: var(--toast-action);
    font-weight: 700;
    font-size: var(--font-sm);
  }
}
</style>
