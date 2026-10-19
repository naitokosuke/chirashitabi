<script setup lang="ts">
import { ref } from "vue";

import CtSegmented from "../segmented/CtSegmented.vue";
import CtTabList from "../tabs/CtTabList.vue";

defineArt("./CtGlass.vue", {
  title: "CtGlass",
  category: "Surfaces",
  description:
    "A pill of glass floating over a view; the control in it takes the glass as its track",
  status: "ready",
});

const DAYS = Array.from({ length: 6 }, (_, i) => ({ value: `d${i + 1}`, label: `Day ${i + 1}` }));
const day = ref("d1");
const MODES = [
  { value: "edit", label: "Edit" },
  { value: "read", label: "Read" },
];
const mode = ref("edit");
</script>

<style scoped>
/* a busy desk under the glass, so it shows through */
.desk {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 420px;
  padding: 24px 12px;
  border-radius: 12px;
  background: repeating-linear-gradient(45deg, var(--wash) 0 12px, transparent 12px 24px);
}

/* as the booklet lays them out: the days scroll in what is left, the switch keeps its width */
.mode {
  flex-shrink: 0;
}
</style>

<art>
  <variant default name="Tabs and a switch">
    <div class="desk">
      <CtGlass>
        <CtTabList v-model="day" label="Days" :tabs="DAYS" variant="pill" />
      </CtGlass>
      <CtGlass class="mode">
        <CtSegmented v-model="mode" label="Mode" :options="MODES" />
      </CtGlass>
    </div>
  </variant>
</art>
