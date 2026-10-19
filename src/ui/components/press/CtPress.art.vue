<script setup lang="ts">
import { ref } from "vue";

import CtPaper from "../paper/CtPaper.vue";

defineArt("./CtPress.vue", {
  title: "CtPress",
  category: "Actions",
  description: "Words pressed where they are written; `cover` makes the whole slip the button",
  status: "ready",
});

const picked = ref(false);

function toggle() {
  picked.value = !picked.value;
}
</script>

<style scoped>
.stack {
  display: grid;
  gap: 16px;
  max-width: 360px;
}

.slip {
  font-size: var(--font-sm);
  font-weight: 700;
}
</style>

<art>
  <variant default name="A title, and a slip">
    <div class="stack">
      <CtPress>Change yen to NT$</CtPress>
      <div class="slip">
        <CtPaper :selected="picked">
          <CtPress cover :aria-pressed="picked" @click="toggle">Smoothie House shaved ice</CtPress>
        </CtPaper>
      </div>
    </div>
  </variant>
</art>
