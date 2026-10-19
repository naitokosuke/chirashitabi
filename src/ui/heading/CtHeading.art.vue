<script setup lang="ts">
defineArt("./CtHeading.vue", {
  title: "CtHeading",
  category: "Type",
  description: "A heading at one of the app's sizes: page, sheet, section, card, minor",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-6);
}
</style>

<art>
  <variant default name="Every size">
    <div class="stack">
      <CtHeading as="h1" level="page">Taiwan trip</CtHeading>
      <CtHeading level="sheet">New note</CtHeading>
      <CtHeading level="section">To-dos</CtHeading>
      <CtHeading level="card">Din Tai Fung</CtHeading>
      <CtHeading as="h3" level="minor">If there is time</CtHeading>
      <CtHeading as="h3" level="minor" muted>A quieter one</CtHeading>
    </div>
  </variant>
</art>
