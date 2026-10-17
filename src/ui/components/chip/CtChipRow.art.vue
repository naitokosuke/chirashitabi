<script setup lang="ts">
import { ref } from "vue";

import CtChip from "./CtChip.vue";

defineArt("./CtChipRow.vue", {
  title: "CtChipRow",
  category: "Chips",
  description: "A single row of chips that scrolls sideways and fades at its end",
  status: "ready",
});

const TAGS = ["Food", "Sights", "Shopping", "Cafe", "Night market", "Temple", "Hotel", "Train"];
const picked = ref("Food");
</script>

<style scoped>
/* narrower than the chips, so the row has to scroll */
.frame {
  display: flex;
  max-width: 360px;
}
</style>

<art>
  <variant default name="Overflowing">
    <div class="frame">
      <CtChipRow>
        <CtChip v-for="t in TAGS" :key="t" :selected="t === picked" @click="() => (picked = t)">{{
          t
        }}</CtChip>
      </CtChipRow>
    </div>
  </variant>
</art>
