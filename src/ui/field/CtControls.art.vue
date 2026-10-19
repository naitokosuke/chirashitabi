<script setup lang="ts">
import { ref, useId } from "vue";

import CtCheck from "./CtCheck.vue";
import CtCheckbox from "./CtCheckbox.vue";
import CtField from "./CtField.vue";
import CtFileInput from "./CtFileInput.vue";
import CtInput from "./CtInput.vue";
import CtTextarea from "./CtTextarea.vue";

defineArt("./CtSelect.vue", {
  title: "CtSelect, CtTextarea, CtCheckbox, CtCheck, CtFileInput",
  category: "Forms",
  description:
    "A field's other controls: one of a few, lines to write in, a box to tick, a file to pick",
  status: "ready",
});

const id = useId();
const booking = ref("none");
const note = ref("");
const keep = ref(false);
const time = ref("12:30");
const minutes = ref("60");
</script>

<style scoped>
.form {
  display: grid;
  gap: var(--space-8);
  max-width: var(--stage-sm);
}

/* a slip's time tab: the two small fields on paper */
.tab {
  display: grid;
  gap: var(--space-2);
  width: var(--size-fold);
  padding: var(--space-5) var(--space-3);
  background: var(--paper-white);
}

label {
  display: flex;
  align-items: center;
  gap: var(--space-4);
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
      <CtCheck :id="`${id}-again`" v-model="keep" quiet>Keep writing (CtCheck)</CtCheck>
      <CtField :for="`${id}-photo`" label="Photo">
        <CtFileInput :id="`${id}-photo`" accept="image/*" />
      </CtField>
      <div class="tab" data-paper>
        <CtInput v-model="time" aria-label="Time" size="sm" type="time" />
        <CtSelect v-model="minutes" aria-label="How long" size="sm">
          <option value="">-</option>
          <option value="60">1 hour</option>
        </CtSelect>
      </div>
    </div>
  </variant>
</art>
