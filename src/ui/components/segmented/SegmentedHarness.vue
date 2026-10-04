<script setup lang="ts" vapor>
import CtSegmented from "./CtSegmented.vue";
import { OPTIONS, state } from "./harness";

/** The switch as the booklet has it (shiori.vue's mode), for segmented.browser.test.ts */
</script>

<template>
  <CtSegmented v-model="state.picked" :options="OPTIONS" label="mode" />
</template>
