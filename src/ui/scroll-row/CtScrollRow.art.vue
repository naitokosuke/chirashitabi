<script setup lang="ts">
import { ref } from "vue";

import CtChip from "../chip/CtChip.vue";
import CtPaper from "../paper/CtPaper.vue";

defineArt("./CtScrollRow.vue", {
  title: "CtScrollRow",
  category: "Layout",
  description: "A single row that scrolls sideways and fades at its end: chips, slips of paper",
  status: "ready",
});

const TAGS = ["Food", "Sights", "Shopping", "Cafe", "Night market", "Temple", "Hotel", "Train"];
const picked = ref("Food");
const SLIPS = ["Shaved ice", "Honey lager", "EasyCard", "Night market", "Temple"];
</script>

<style scoped>
/* narrower than what is in it, so the row has to scroll */
.frame {
  display: flex;
  max-width: var(--stage-sm);
}

li {
  flex-shrink: 0;
}
</style>

<art>
  <variant default name="Chips, from a view's edge">
    <div class="frame">
      <CtScrollRow inset>
        <CtChip
          v-for="t in TAGS"
          :key="t"
          :selected="t === picked"
          @click="function () {
            picked = t;
          }"
        >{{
          t
        }}</CtChip>
      </CtScrollRow>
    </div>
  </variant>
  <variant name="A list of slips">
    <div class="frame">
      <CtScrollRow as="ul">
        <li v-for="s in SLIPS" :key="s">
          <CtPaper>{{ s }}</CtPaper>
        </li>
      </CtScrollRow>
    </div>
  </variant>
</art>
