<script setup lang="ts">
import { ref } from "vue";

import CtSwipeAction from "./CtSwipeAction.vue";

defineArt("./CtSwipeRow.vue", {
  title: "CtSwipeRow",
  category: "Actions",
  description:
    "A row slid left to show its actions (CtSwipeAction); ← from the keyboard opens it, → or Escape shuts it",
  status: "ready",
});

const TRIPS = ["Taiwan trip", "Kyoto weekend", "Seoul in winter"];
const open = ref<string | null>(null);
</script>

<style scoped>
.trips {
  display: grid;
  gap: var(--space-4);
  max-width: var(--stage-sm);
  padding: 0;
  list-style: none;
}

.trip {
  display: block;
  padding: var(--space-8);
  border-radius: var(--radius-6);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}
</style>

<art>
  <variant default name="A list of trips">
    <ul class="trips">
      <li v-for="t in TRIPS" :key="t">
        <CtSwipeRow
          :open="open === t"
          @toggle="function (o) {
            open = o ? t : null;
          }"
        >
          <template #default>
            <a class="trip" href="#trip">{{ t }}</a>
          </template>
          <template #actions>
            <CtSwipeAction danger>Delete</CtSwipeAction>
          </template>
        </CtSwipeRow>
      </li>
    </ul>
  </variant>
</art>
