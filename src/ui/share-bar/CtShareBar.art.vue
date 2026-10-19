<script setup lang="ts">
defineArt("./CtShareBar.vue", {
  title: "CtShareBar",
  category: "Data",
  description: "How a whole splits into parts: one bar, and a key with each part's count",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-12);
  max-width: var(--stage-md);
}
</style>

<art>
  <variant default name="Three parts, and none yet">
    <div class="stack">
      <CtShareBar
        :parts="[
          { key: 'fixed', label: 'Confirmed', count: 6, tone: 'full' },
          { key: 'maybe', label: 'Maybe', count: 3, tone: 'half' },
          { key: 'loose', label: 'Not on a day', count: 5, tone: 'faint' },
        ]"
      />
      <CtShareBar
        :parts="[
          { key: 'fixed', label: 'Confirmed', count: 0, tone: 'full' },
          { key: 'maybe', label: 'Maybe', count: 0, tone: 'half' },
          { key: 'loose', label: 'Not on a day', count: 0, tone: 'faint' },
        ]"
      />
    </div>
  </variant>
</art>
