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

/** A request the hold sends, answering a moment later that it went */
function goes() {
  return new Promise<boolean>((resolve) => setTimeout(resolve, 800, true));
}
/** One answering that it did not: the button drains back, never saying done */
function fails() {
  return new Promise<boolean>((resolve) => setTimeout(resolve, 800, false));
}
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
  <variant name="Icon">
    <CtHoldButton done="Kept" label="Keep it" @hold="() => held++">
      <template #icon>👍</template>
      <template #hint>Press and hold</template>
    </CtHoldButton>
  </variant>
  <variant name="Answered by its owner">
    <CtHoldButton done="Restored" label="Restore" :act="goes">
      <template #hint>Press and hold</template>
    </CtHoldButton>
  </variant>
  <variant name="Answered, failing">
    <CtHoldButton danger done="Gone for good" label="Delete forever" :act="fails">
      <template #hint>Press and hold</template>
    </CtHoldButton>
  </variant>
  <variant name="Disabled">
    <CtHoldButton disabled done="Deleted" label="Delete forever" />
  </variant>
</art>
