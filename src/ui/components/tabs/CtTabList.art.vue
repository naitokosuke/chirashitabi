<script setup lang="ts">
import { computed, ref } from "vue";

import CtTabPanel from "./CtTabPanel.vue";

defineArt("./CtTabList.vue", {
  title: "CtTabList",
  category: "Choices",
  description:
    "Tabs whose underline slides to the one chosen; a row longer than its box scrolls it into view",
  status: "ready",
});

const DAYS = Array.from({ length: 8 }, (_, i) => ({ value: `d${i + 1}`, label: `Day ${i + 1}` }));
const day = ref("d1");
const label = computed(() => DAYS.find((d) => d.value === day.value)?.label);
</script>

<style scoped>
/* narrower than the days, so the row has to scroll */
.frame {
  max-width: 360px;
}

.plan {
  padding: 16px 4px;
}
</style>

<art>
  <variant default name="With a panel">
    <div class="frame">
      <CtTabList v-model="day" :tabs="DAYS" label="Days" />
      <CtTabPanel>
        <p class="plan">{{ label }}'s plan</p>
      </CtTabPanel>
    </div>
  </variant>
</art>
