<script setup lang="ts">
import { ref } from "vue";

import CtChip from "../chip/CtChip.vue";

import CtMenuGroup from "./CtMenuGroup.vue";
import CtMenuItem from "./CtMenuItem.vue";

defineArt("./CtMenu.vue", {
  title: "CtMenu",
  category: "Actions",
  description: "A floating toolbar of what can be done to a card: items, a group picked in it",
  status: "ready",
});

const DAYS = ["11/3", "11/4", "11/5"];
const day = ref("11/4");
</script>

<style scoped>
/* the view it floats over; the menu places itself against it */
.view {
  position: relative;
  height: 180px;
  border-radius: 12px;
  background: var(--wash);
}
</style>

<art>
  <variant default name="A card's menu">
    <div class="view">
      <CtMenu :x="16" :y="16" label="Din Tai Fung">
        <CtMenuGroup label="Day">
          <CtChip
            v-for="d in DAYS"
            :key="d"
            :selected="d === day"
            toggle
            @click="function () {
              day = d;
            }"
          >{{ d }}</CtChip>
        </CtMenuGroup>
        <CtMenuItem>Duplicate</CtMenuItem>
        <CtMenuItem danger>Delete</CtMenuItem>
      </CtMenu>
    </div>
  </variant>
</art>
