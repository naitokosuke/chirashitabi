<script setup lang="ts" vapor>
import { onBeforeUnmount, useTemplateRef, watch } from "vue";

import { CtButton, CtToast } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useToast } from "./useToast";

const toast = useToast();
const i18n = useI18n();

const region = useTemplateRef<HTMLElement>("region");
const undoButton = useTemplateRef<{ focus(): void }>("undoButton");
// a toast shown for the keyboard takes it onto its undo, once that is drawn; one gone from under
// the pointer leaves nothing under it to hold the next
watch(
  () => toast.current,
  (t) => {
    if (t === null) toast.hold("pointer", false);
    else if (t.focus) undoButton.value?.focus();
  },
  { flush: "post" },
);

// the keyboard on the toast, or the pointer over it, keeps it up (useToast)
const focusIn = () => toast.hold("focus", true);
function focusOut(e: FocusEvent) {
  const to = e.relatedTarget;
  if (!(to instanceof Node && region.value?.contains(to) === true)) toast.hold("focus", false);
}
const pointerIn = () => toast.hold("pointer", true);
const pointerOut = () => toast.hold("pointer", false);
onBeforeUnmount(() => {
  toast.hold("focus", false);
  toast.hold("pointer", false);
});
</script>

<template>
  <!-- the live region stays, so what lands in it is read out -->
  <div
    ref="region"
    role="status"
    @focusin="focusIn"
    @focusout="focusOut"
    @pointerenter="pointerIn"
    @pointerleave="pointerOut"
  >
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
