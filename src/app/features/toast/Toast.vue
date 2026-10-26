<script setup lang="ts" vapor>
import { useTemplateRef, watch } from "vue";

import { CtButton, CtToast } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useToast } from "./useToast";

const toast = useToast();
const i18n = useI18n();

const undoButton = useTemplateRef<{ focus(): void }>("undoButton");
// a toast shown for the keyboard takes it onto its undo, once that is drawn
watch(
  () => toast.current,
  (t) => {
    if (t?.focus === true) undoButton.value?.focus();
  },
  { flush: "post" },
);
</script>

<template>
  <!-- the live region stays, so what lands in it is read out -->
  <div role="status">
    <CtToast v-if="toast.current !== null" class="toast">
      <template #default>{{ toast.current.text }}</template>
      <template v-if="toast.current.undo !== undefined" #action>
        <CtButton ref="undoButton" variant="text" @click="toast.undo">{{
          i18n.t("canvas.undo")
        }}</CtButton>
      </template>
    </CtToast>
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
}
</style>
