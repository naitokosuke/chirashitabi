<script setup lang="ts">
import { ref, useId } from "vue";

import CtCheckbox from "./CtCheckbox.vue";
import CtField from "./CtField.vue";
import CtTextarea from "./CtTextarea.vue";

defineArt("./CtSelect.vue", {
  title: "CtSelect, CtTextarea, CtCheckbox",
  category: "Forms",
  description: "A field's other controls: one of a few, lines to write in, a box to tick",
  status: "ready",
});

const id = useId();
const booking = ref("none");
const note = ref("");
const keep = ref(false);
</script>

<style scoped>
.form {
  display: grid;
  gap: 16px;
  max-width: 360px;
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

<art>
  <variant default name="A form's controls">
    <div class="form">
      <CtField :for="`${id}-booking`" label="Booking">
        <CtSelect :id="`${id}-booking`" v-model="booking">
          <option value="none">Not needed</option>
          <option value="needed">To book</option>
          <option value="booked">Booked</option>
        </CtSelect>
      </CtField>
      <CtField :for="`${id}-note`" label="Note">
        <CtTextarea :id="`${id}-note`" v-model="note" rows="4" size="lg" />
      </CtField>
      <CtTextarea v-model="note" aria-label="The day's line" dashed rows="2" />
      <label :for="`${id}-keep`"><CtCheckbox :id="`${id}-keep`" v-model="keep" />Keep writing</label>
    </div>
  </variant>
</art>
