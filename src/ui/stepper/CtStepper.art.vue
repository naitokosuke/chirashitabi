<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtStepper.vue", {
  title: "CtStepper",
  category: "Forms",
  description: "A count set a step at a time, − and + either side of it, in a field's box",
  status: "ready",
});

const days = ref(4);
</script>

<style scoped>
.frame {
  max-width: var(--stage-sm);
}
</style>

<art>
  <variant default name="Days">
    <div class="frame">
      <CtStepper v-model="days" fewer="Fewer days" label="Days" :max="14" :min="1" more="More days">{{
          days
        }} days</CtStepper>
    </div>
  </variant>
</art>
