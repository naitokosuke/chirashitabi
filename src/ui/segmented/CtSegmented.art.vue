<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtSegmented.vue", {
  title: "CtSegmented",
  category: "Choices",
  description: "A few options in a track; the pale pill stretches to the next one picked",
  status: "ready",
});

const MODES = [
  { value: "edit", label: "Edit" },
  { value: "read", label: "Read" },
];
const VIEWS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "trip", label: "Whole trip" },
];
const mode = ref("edit");
const view = ref("day");
</script>

<art>
  <variant default name="Two options">
    <CtSegmented v-model="mode" :options="MODES" label="Mode" />
  </variant>
  <variant name="Three options">
    <CtSegmented v-model="view" :options="VIEWS" label="View" />
  </variant>
</art>
