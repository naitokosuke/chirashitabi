<script setup lang="ts">
import CtButton from "../button/CtButton.vue";

import CtMessage from "./CtMessage.vue";

defineArt("./CtHint.vue", {
  title: "CtHint, CtMessage",
  category: "Type",
  description: "A quiet line said under something, and a message the person is told, boxed or not",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-6);
  max-width: var(--stage-md);
}
</style>

<art>
  <variant default name="Hint and messages">
    <div class="stack">
      <CtHint>Times are each airport's own, as on the ticket.</CtHint>
      <CtHint size="sm">Nothing to do yet.</CtHint>
      <CtHint strong>Until 14:00 · NT$500</CtHint>
      <CtHint danger strong>By 10/30</CtHint>
      <CtHint size="md" strong>Write a note with the + button below.</CtHint>
      <CtHint size="lg">No trips yet. A blank tag below starts one.</CtHint>
      <CtMessage>2 notes will lose their day.</CtMessage>
      <CtMessage danger>The draft did not come. Ask again.</CtMessage>
      <CtMessage boxed>
        The room did not answer.
        <CtButton variant="primary">Try again</CtButton>
      </CtMessage>
    </div>
  </variant>
  <variant name="Live, with nothing to say yet and with words">
    <div class="stack">
      <CtHint>Above an empty live hint, which takes no room.</CtHint>
      <CtHint live />
      <CtHint live>Reading the page…</CtHint>
      <CtMessage danger live />
      <CtMessage danger live>The draft did not come. Ask again.</CtMessage>
    </div>
  </variant>
</art>
