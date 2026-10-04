<script setup lang="ts" vapor>
import CtSwatches from "./CtSwatches.vue";
import { COLORS, state } from "./harness";

/** The swatches as a form has them (NewTrip.vue), for swatches.browser.test.ts */
</script>

<template>
  <CtSwatches
    :colors="COLORS"
    :selected="state.selected"
    label="color"
    @select="(c) => (state.selected = c)"
  />
</template>
