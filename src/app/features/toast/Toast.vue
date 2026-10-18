<script setup lang="ts" vapor>
import { useI18n } from "../../i18n/useI18n";

import { useToast } from "./useToast";

const toast = useToast();
const i18n = useI18n();
</script>

<template>
  <!-- the live region stays, so what lands in it is read out -->
  <div role="status">
    <div v-if="toast.current !== null" class="toast">
      <span>{{ toast.current.text }}</span>
      <button v-if="toast.current.undo !== undefined" type="button" @click="() => toast.undo()">{{
        i18n.t("canvas.undo")
      }}</button>
    </div>
  </div>
</template>

<style scoped>
/* Above the view and its write button's row, below a sheet: wherever the user is, a write confirms there */
.toast {
  position: absolute;
  inset-inline: 16px;
  inset-block-end: calc(var(--dock-clear) + 84px);
  max-width: 480px;
  margin-inline: auto;
  z-index: var(--z-menu);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: var(--font-md);
  font-weight: 700;
  box-shadow: var(--shadow-float);

  /* the action is the toast's own ink, told apart by its underline, not by a color */
  > button {
    flex-shrink: 0;
    white-space: nowrap;
    min-height: var(--tap);
    padding-inline: 4px;
    font-weight: 700;
    font-size: var(--font-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}
</style>
