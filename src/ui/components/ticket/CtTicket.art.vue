<script setup lang="ts">
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

.big {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: 700;
}
</style>

<art>
  <variant default name="A flight and a stay">
    <div class="stack">
      <CtTicket aside="11/3 (Tue)" detail="BR 191" label="Out">
        <p class="big">HND 08:50 → TSA 11:30</p>
      </CtTicket>
      <CtTicket aside="From 11/3, 3 nights" label="Stay">
        <p class="big">Hotel Proverbs Taipei</p>
      </CtTicket>
    </div>
  </variant>
</art>
