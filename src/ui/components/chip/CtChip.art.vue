<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtChip.vue", {
  title: "CtChip",
  category: "Chips",
  description:
    "A rounded pill: selected fills it with ink; toggle makes it a switch (aria-pressed)",
  status: "ready",
});

const on = ref(false);
</script>

<art>
  <variant default name="Default">
    <CtChip>Food</CtChip>
  </variant>
  <variant name="Selected">
    <CtChip selected>Food</CtChip>
  </variant>
  <variant name="With count">
    <CtChip :count="12">Food</CtChip>
  </variant>
  <variant name="Suggested, and new">
    <div>
      <CtChip suggested>Food</CtChip>
      <CtChip aside="new" dashed>Night market</CtChip>
    </div>
  </variant>
  <variant name="Toggle">
    <CtChip toggle :selected="on" @click="() => (on = !on)">Done only</CtChip>
  </variant>
</art>
