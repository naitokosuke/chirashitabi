<script setup lang="ts" vapor>
import CtHoldButton from "./CtHoldButton.vue";
import { HOLD_TIME, state } from "./harness";

/** The button as the deleted shelf has it (Rooms.vue), for hold.browser.test.ts */
</script>

<template>
  <CtHoldButton
    danger
    done="Deleted"
    label="Delete forever"
    :hold-time="HOLD_TIME"
    @hold="() => state.held++"
  >
    <template #hint>Press and hold</template>
  </CtHoldButton>
</template>
