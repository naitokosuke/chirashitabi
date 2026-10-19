<script setup lang="ts">
import CtByline from "./CtByline.vue";

defineArt("./CtAvatar.vue", {
  title: "CtAvatar",
  category: "People",
  description: "Who someone is by their color: a face with their initial, a dot, or a held seat",
  status: "ready",
});
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}
</style>

<art>
  <variant default name="Faces">
    <div class="row">
      <CtAvatar color="#5b7fd6" name="Yuki" />
      <CtAvatar color="#d65b6a" name="Ken" size="lg" />
      <CtAvatar pending />
    </div>
  </variant>
  <variant name="Dots">
    <div class="row">
      <CtAvatar color="#5b7fd6" size="dot" />Yuki
      <CtAvatar color="#d65b6a" size="dot" />Ken
    </div>
  </variant>
  <variant name="Bylines">
    <div class="row">
      <CtByline color="#d65b6a" size="xs">Ken</CtByline>
      <CtByline color="#5b7fd6" strong>Yuki invited you</CtByline>
    </div>
  </variant>
</art>
