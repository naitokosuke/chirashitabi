<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtSwatches.vue", {
  title: "CtSwatches",
  category: "Choices",
  description:
    "Colors to pick one of; the ring stretches across to the pick and contracts around it",
  status: "ready",
});

const COLORS = ["#3c6ee0", "#d7263d", "#1b998b", "#f4a261", "#8e5bd8", "#2a9d3c"];
const color = ref(COLORS[0]!);
</script>

<art>
  <variant default name="Member colors">
    <CtSwatches v-model="color" :colors="COLORS" label="Color" />
  </variant>
</art>
