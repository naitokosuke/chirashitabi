<script setup lang="ts">
import { ref, useId } from "vue";

import CtBackButton from "../back/CtBackButton.vue";
import CtButton from "../button/CtButton.vue";
import CtField from "../field/CtField.vue";
import CtInput from "../field/CtInput.vue";
import CtHeading from "../heading/CtHeading.vue";

defineArt("./CtSheet.vue", {
  title: "CtSheet",
  category: "Surfaces",
  description: "A sheet over the views: the way back, what scrolls, and its act at the foot",
  status: "ready",
});

const id = useId();
const name = ref("Taiwan trip");
</script>

<style scoped>
.stage {
  position: relative;
  height: 420px;
  max-width: 420px;
  overflow: hidden;
  border-radius: 12px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.act {
  display: grid;
}
</style>

<art>
  <variant default name="A form">
    <div class="stage">
      <CtSheet as="form">
        <template #top><CtBackButton>Trips</CtBackButton></template>
        <template #default>
          <div class="fields">
            <CtHeading level="sheet">New trip</CtHeading>
            <CtField :for="`${id}-name`" label="Name">
              <CtInput :id="`${id}-name`" v-model="name" />
            </CtField>
          </div>
        </template>
        <template #foot>
          <div class="act"><CtButton size="lg" variant="primary">Create the trip</CtButton></div>
        </template>
      </CtSheet>
    </div>
  </variant>
</art>
