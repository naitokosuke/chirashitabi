<script setup lang="ts">
import { ref, useId } from "vue";

import CtInput from "./CtInput.vue";

defineArt("./CtField.vue", {
  title: "CtField",
  category: "Forms",
  description:
    "A field of a form: its name over it, then a CtInput (or any control) and what is said under it",
  status: "ready",
});

const id = useId();
const name = ref("");
const nights = ref(3);
</script>

<style scoped>
.card {
  display: grid;
  gap: var(--space-8);
  padding: var(--space-8);
  border-radius: var(--radius-8);
  background: var(--surface);
  --field-bg: var(--bg);
}
</style>

<art>
  <variant default name="With an input">
    <CtField :for="`${id}-name`" label="Trip name">
      <CtInput :id="`${id}-name`" v-model="name" placeholder="Taiwan trip" />
    </CtField>
  </variant>
  <variant name="With a note">
    <CtField :for="`${id}-noted`" label="Trip name">
      <template #note>the one thing it needs</template>
      <template #default>
        <CtInput :id="`${id}-noted`" v-model="name" />
      </template>
    </CtField>
  </variant>
  <variant name="On a card">
    <div class="card">
      <CtField :for="`${id}-nights`" label="Nights">
        <CtInput :id="`${id}-nights`" v-model.number="nights" inputmode="numeric" type="number" />
      </CtField>
    </div>
  </variant>
</art>
