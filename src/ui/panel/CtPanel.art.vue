<script setup lang="ts">
defineArt("./CtPanel.vue", {
  title: "CtPanel",
  category: "Surfaces",
  description: "A panel of the surface with a hairline round it, holding a group; float lifts it",
  status: "ready",
});
</script>

<style scoped>
.frame {
  display: grid;
  gap: 16px;
  max-width: 360px;
}

li {
  padding: 12px 14px;

  & + li {
    border-block-start: 1px solid var(--line);
  }
}
</style>

<art>
  <variant default name="A notice">
    <div class="frame">
      <CtPanel as="p">The room did not answer. Try again in a moment.</CtPanel>
    </div>
  </variant>
  <variant name="A list">
    <div class="frame">
      <CtPanel as="ul" pad="none">
        <li>Yuki</li>
        <li>Ken</li>
      </CtPanel>
    </div>
  </variant>
  <variant name="Floating">
    <div class="frame">
      <CtPanel float pad="sm">Edit · Duplicate · Delete</CtPanel>
    </div>
  </variant>
</art>
