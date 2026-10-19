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
  gap: 12px;
  max-width: 420px;
}
</style>

<art>
  <variant default name="Hint and messages">
    <div class="stack">
      <CtHint>Times are each airport's own, as on the ticket.</CtHint>
      <CtHint size="sm">Nothing to do yet.</CtHint>
      <CtMessage>2 notes will lose their day.</CtMessage>
      <CtMessage danger>The draft did not come. Ask again.</CtMessage>
      <CtMessage boxed>
        The room did not answer.
        <CtButton variant="primary">Try again</CtButton>
      </CtMessage>
    </div>
  </variant>
</art>
