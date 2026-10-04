<script setup lang="ts" vapor>
import CtCalendar from "./CtCalendar.vue";
import { state } from "./harness";

/** The calendar as a form has it (NewTrip.vue's dates, a range), or for one day, for calendar.browser.test.ts */
</script>

<template>
  <CtCalendar
    v-if="state.range"
    v-model="state.dates"
    range
    :max-days="60"
    locale="en"
    prev-label="Previous month"
    next-label="Next month"
  />
  <CtCalendar
    v-else
    v-model="state.day"
    locale="en"
    prev-label="Previous month"
    next-label="Next month"
  />
</template>
