<script setup lang="ts">
import CtBanner from "../banner/CtBanner.vue";
import CtButton from "../button/CtButton.vue";

defineArt("./CtToast.vue", {
  title: "CtToast, CtBanner",
  category: "Feedback",
  description: "A word that a write went through, and a band saying what holds for every view",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-8);
  max-width: var(--stage-lg);
}

.band {
  height: var(--notice);
  line-height: calc(var(--notice) - var(--space-2));
}
</style>

<art>
  <variant default name="Toast and banner">
    <div class="stack">
      <CtToast>Moved to 11/4</CtToast>
      <CtToast>
        <template #default>Deleted the note</template>
        <template #action><CtButton variant="text">Undo</CtButton></template>
      </CtToast>
      <CtBanner class="band">
        <template #default>Offline · as of 12:30</template>
        <template #action><CtButton variant="text">Try again</CtButton></template>
      </CtBanner>
    </div>
  </variant>
</art>
