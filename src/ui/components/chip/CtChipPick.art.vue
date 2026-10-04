<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtChipPick.vue", {
  title: "CtChipPick",
  category: "Choices",
  description: "Chips to pick one of; the ink stretches across to the pick and contracts onto it",
  status: "ready",
});

const OPTIONS = ["TWD", "JPY", "USD", "EUR"].map((c) => ({ value: c, label: c }));
const picked = ref("TWD");
</script>

<art>
  <variant default name="Currency">
    <CtChipPick v-model="picked" :options="OPTIONS" label="Currency" />
  </variant>
</art>
