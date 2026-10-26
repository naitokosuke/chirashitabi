<script setup lang="ts" vapor>
import CtHoldButton from "./CtHoldButton.vue";
import { HOLD_TIME, state } from "./harness";

/** The button as the deleted shelf has it (Rooms.vue), for hold-button.browser.test.ts */
function act() {
  state.held++;
  return new Promise<boolean>((resolve) => {
    state.answer = resolve;
  });
}
</script>

<template>
  <CtHoldButton
    danger
    done="Deleted"
    label="Delete forever"
    :act="state.owned ? act : undefined"
    :disabled="state.disabled"
    :hold-time="HOLD_TIME"
    @hold="() => state.held++"
  >
    <template #hint>Press and hold</template>
  </CtHoldButton>
</template>
