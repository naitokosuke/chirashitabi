<script setup lang="ts" vapor>
import { CtButton, CtToast } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useToast } from "./useToast";

const toast = useToast();
const i18n = useI18n();
</script>

<template>
  <!-- the live region stays, so what lands in it is read out -->
  <div role="status">
    <CtToast v-if="toast.current !== null" class="toast">
      <template #default>{{ toast.current.text }}</template>
      <template v-if="toast.current.undo !== undefined" #action>
        <CtButton variant="text" @click="toast.undo">{{ i18n.t("canvas.undo") }}</CtButton>
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
