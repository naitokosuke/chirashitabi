<script setup lang="ts">
import { computed, ref } from "vue";

defineArt("./CtTextMorph.vue", {
  title: "CtTextMorph",
  category: "Text",
  description:
    "Text that morphs: the characters old and new share slide, the others fade out and in",
  status: "ready",
});

const day = ref(1);
const parts = computed(() => [
  { text: `${day.value}日目 `, tone: "day" },
  { text: `11/${day.value + 2}` },
]);
</script>

<art>
  <variant default name="A day heading">
    <div style="display: flex; align-items: center; gap: 12px">
      <button type="button" @click="() => (day = Math.max(1, day - 1))">‹</button>
      <h2 style="margin: 0"><CtTextMorph :parts /></h2>
      <button type="button" @click="() => day++">›</button>
    </div>
  </variant>
</art>
