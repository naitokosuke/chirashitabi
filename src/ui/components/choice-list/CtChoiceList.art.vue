<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtChoiceList.vue", {
  title: "CtChoiceList",
  category: "Choices",
  description:
    "What a search found, a line each, to choose one of; dashed when the agent offers it",
  status: "ready",
});

const PLACES = [
  {
    key: "a",
    label: "Din Tai Fung Xinyi",
    detail: "No. 194, Section 2, Xinyi Rd, Da'an District, Taipei",
  },
  {
    key: "b",
    label: "Din Tai Fung Taipei 101",
    detail: "B1, No. 45, Shifu Rd, Xinyi District, Taipei",
  },
];
const chosen = ref("");
</script>

<style scoped>
.frame {
  max-width: 360px;
}
</style>

<art>
  <variant default name="Found by a search">
    <div class="frame">
      <CtChoiceList
        :items="PLACES"
        @choose="function (it) {
          chosen = it.key;
        }"
      />
    </div>
  </variant>
  <variant name="Offered by the agent">
    <div class="frame">
      <CtChoiceList dashed :items="PLACES" />
    </div>
  </variant>
</art>
