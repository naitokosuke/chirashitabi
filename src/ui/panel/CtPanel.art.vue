<script setup lang="ts">
import { ref, useId } from "vue";

import CtButton from "../button/CtButton.vue";
import CtField from "../field/CtField.vue";
import CtInput from "../field/CtInput.vue";

defineArt("./CtPanel.vue", {
  title: "CtPanel",
  category: "Surfaces",
  description: "A panel of the surface with a hairline round it, holding a group; float lifts it",
  status: "ready",
});

const id = useId();
const name = ref("Taiwan trip");
const sent = ref(0);

function send() {
  sent.value++;
}
</script>

<style scoped>
.frame {
  display: grid;
  gap: var(--space-8);
  max-width: var(--stage-sm);
}

li {
  padding: var(--space-6) var(--space-7);

  & + li {
    border-block-start: var(--line-width) solid var(--line);
  }
}

.form {
  display: grid;
  gap: var(--space-6);
}
</style>

<art>
  <variant default name="A notice">
    <div class="frame">
      <CtPanel as="p">The room did not answer. Try again in a moment.</CtPanel>
    </div>
  </variant>
  <variant name="A list">
    <div class="frame">
      <CtPanel as="ul" pad="none">
        <li>Yuki</li>
        <li>Ken</li>
      </CtPanel>
    </div>
  </variant>
  <variant name="A form">
    <div class="frame">
      <CtPanel as="form" class="form" pad="lg" @submit="send">
        <CtField :for="`${id}-name`" label="Name">
          <CtInput :id="`${id}-name`" v-model="name" />
        </CtField>
        <CtButton type="submit" variant="primary">Save</CtButton>
        <p>Sent {{ sent }} times, the page staying</p>
      </CtPanel>
    </div>
  </variant>
  <variant name="Floating">
    <div class="frame">
      <CtPanel float pad="sm">Edit · Duplicate · Delete</CtPanel>
    </div>
  </variant>
</art>
