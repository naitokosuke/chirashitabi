<script setup lang="ts" vapor>
import CtChipPick from "./CtChipPick.vue";
import { OPTIONS, state } from "./harness";

/** The chips as a form has them (NewTrip.vue's currency), for pick.browser.test.ts */
</script>

<template>
  <CtChipPick v-model="state.picked" :options="OPTIONS" label="currency" />
</template>
