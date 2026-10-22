<script setup lang="ts" vapor>
import CtChipInput from "./CtChipInput.vue";
import { state } from "./harness";

/** The line for a card's tags, for chip-input.browser.test.ts */
</script>

<template>
  <CtChipInput v-model="state.word" placeholder="Tag" @commit="() => state.committed++" />
</template>
