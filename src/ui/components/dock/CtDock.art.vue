<script setup lang="ts">
import { ref } from "vue";

import CtDockDivider from "./CtDockDivider.vue";
import CtDockGroup from "./CtDockGroup.vue";
import CtDockItem from "./CtDockItem.vue";

defineArt("./CtDock.vue", {
  title: "CtDock",
  category: "Navigation",
  description:
    "The app's one menu, floating at the bottom: a dot slides under the open item, icons magnify under a mouse, groups fold away",
  status: "ready",
});

const TABS = ["Home", "Canvas", "Map"];
const current = ref("Canvas");
const open = ref(true);
const away = ref(false);
</script>

<style scoped>
.screen {
  height: 220px;
  transform: translate(0);
}
</style>

<art>
  <variant default name="In a trip">
    <!-- a screen of its own: the transform makes it the box the fixed dock sits at the bottom of -->
    <div class="screen">
      <label><input v-model="open" type="checkbox" /> Group open</label>
      <label><input v-model="away" type="checkbox" /> Away</label>
      <CtDock label="Menu" :away>
        <CtDockItem label="Trips" :current="current === 'Trips'" @click="() => (current = 'Trips')">
          <svg
            aria-hidden="true"
            fill="none"
            height="22"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="22"
          ><rect height="16" rx="3" width="16" x="4" y="4" /></svg>
        </CtDockItem>
        <CtDockGroup :open>
          <CtDockItem
            v-for="t in TABS"
            :key="t"
            :label="t"
            :current="current === t"
            @click="() => (current = t)"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="22"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
              width="22"
            ><circle cx="12" cy="12" r="7" /></svg>
          </CtDockItem>
        </CtDockGroup>
        <CtDockDivider />
        <CtDockItem label="Theme">
          <svg
            aria-hidden="true"
            fill="none"
            height="22"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="22"
          ><path d="M12 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8z" /></svg>
        </CtDockItem>
      </CtDock>
    </div>
  </variant>
</art>
