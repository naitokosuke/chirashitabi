<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtSwipeRow.vue", {
  title: "CtSwipeRow",
  category: "Actions",
  description:
    "A row slid left to show its actions; ← from the keyboard opens it, → or Escape shuts it",
  status: "ready",
});

const TRIPS = ["Taiwan trip", "Kyoto weekend", "Seoul in winter"];
const open = ref<string | null>(null);
</script>

<style scoped>
.trips {
  display: grid;
  gap: 8px;
  max-width: 360px;
  padding: 0;
  list-style: none;
}

.trip {
  display: block;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}

.delete {
  padding: 0 16px;
  border-radius: 12px;
  background: var(--danger);
  color: var(--on-ink);
}
</style>

<art>
  <variant default name="A list of trips">
    <ul class="trips">
      <li v-for="t in TRIPS" :key="t">
        <CtSwipeRow :open="open === t" @toggle="(o) => (open = o ? t : null)">
          <a class="trip" href="#trip">{{ t }}</a>
          <template #actions>
            <button class="delete" type="button">Delete</button>
          </template>
        </CtSwipeRow>
      </li>
    </ul>
  </variant>
</art>
