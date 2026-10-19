<script setup lang="ts">
import { ref, useId } from "vue";

import CtChip from "../chip/CtChip.vue";

import CtField from "./CtField.vue";

defineArt("./CtChipInput.vue", {
  title: "CtChipInput",
  category: "Forms",
  description: "Words gathered as chips, and a line to write the next one, in one box",
  status: "ready",
});

const id = useId();
const draft = ref("");
const tags = ref(["Food", "Want to go"]);

function commit() {
  const t = draft.value.trim();
  if (t !== "" && !tags.value.includes(t)) tags.value.push(t);
  draft.value = "";
}
function remove(t: string) {
  tags.value.splice(tags.value.indexOf(t), 1);
}
</script>

<style scoped>
.form {
  max-width: 360px;
}
</style>

<art>
  <variant default name="Tags">
    <div class="form">
      <CtField :for="`${id}-tag`" label="Tags">
        <CtChipInput :id="`${id}-tag`" v-model="draft" placeholder="Add a tag…" @commit="commit">
          <CtChip
            v-for="t in tags"
            :key="t"
            selected
            size="sm"
            @click="function () {
              remove(t);
            }"
          >#{{ t }} ×</CtChip>
        </CtChipInput>
      </CtField>
    </div>
  </variant>
</art>
