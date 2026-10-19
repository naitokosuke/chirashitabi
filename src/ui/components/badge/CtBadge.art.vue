<script setup lang="ts">
defineArt("./CtBadge.vue", {
  title: "CtBadge",
  category: "Labels",
  description:
    "A small label, never pressed: a stamp, a count, a state still waiting, a note floating over a view",
  status: "ready",
});
</script>

<style scoped>
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>

<art>
  <variant default name="Every look">
    <div class="row">
      <CtBadge as="time" datetime="2026-11-04">11/4</CtBadge>
      <CtBadge filled>3</CtBadge>
      <CtBadge dashed>To book</CtBadge>
      <CtBadge as="p" float>2 notes have no place yet</CtBadge>
    </div>
  </variant>
</art>
