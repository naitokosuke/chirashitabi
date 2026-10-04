<script setup lang="ts">
import { ref } from "vue";

defineArt("./CtHoldButton.vue", {
  title: "CtHoldButton",
  category: "Actions",
  description: "Held down to act, for what cannot be taken back; let go early and nothing happens",
  status: "ready",
  actionEvents: ["hold"],
});

const held = ref(0);
</script>

<art>
  <variant default name="Default">
    <CtHoldButton done="Left" label="Leave the trip" @hold="() => held++">
      <template #hint>Press and hold</template>
    </CtHoldButton>
  </variant>
  <variant name="Danger">
    <CtHoldButton danger done="Deleted" label="Delete forever" @hold="() => held++">
      <template #hint>Press and hold</template>
    </CtHoldButton>
  </variant>
  <variant name="Disabled">
    <CtHoldButton disabled done="Deleted" label="Delete forever" />
  </variant>
</art>
