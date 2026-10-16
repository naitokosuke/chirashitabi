<script setup lang="ts">
import { Temporal } from "temporal-polyfill-lite";

import { ref } from "vue";

import type { DateRange } from "./calendar";

defineArt("./CtCalendar.vue", {
  title: "CtCalendar",
  category: "Choices",
  description:
    "A month of days to pick one from, or with v-model:range a first day and a last, the days between banded",
  status: "ready",
});

const start = Temporal.PlainDate.from("2026-11-03");
const day = ref(start);
const dates = ref<DateRange>({ start, end: start.add({ days: 3 }) });
</script>

<art>
  <variant default name="Range">
    <CtCalendar
      v-model:range="dates"
      :max-days="60"
      locale="ja"
      next-label="次の月"
      prev-label="前の月"
    />
  </variant>
  <variant name="One day">
    <CtCalendar v-model:day="day" locale="ja" next-label="次の月" prev-label="前の月" />
  </variant>
</art>
