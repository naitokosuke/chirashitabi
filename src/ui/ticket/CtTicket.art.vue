<script setup lang="ts">
import CtLink from "../link/CtLink.vue";
import CtHint from "../text/CtHint.vue";

defineArt("./CtTicket.vue", {
  title: "CtTicket",
  category: "Surfaces",
  description: "A strip of ticket: what it is and when, small, over what it is for, large",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: 8px;
  max-width: 420px;
}
</style>

<art>
  <variant default name="A flight and a stay">
    <div class="stack">
      <CtTicket aside="11/3 (Tue)" detail="BR 191" label="Out">HND 08:50 → TSA 11:30</CtTicket>
      <CtTicket aside="From 11/3, 3 nights" label="Stay">
        <template #default>Hotel Proverbs Taipei</template>
        <template #below>
          <CtHint size="sm"><CtLink href="https://maps.google.com/" quiet>Open in Google Maps</CtLink></CtHint>
        </template>
      </CtTicket>
    </div>
  </variant>
</art>
