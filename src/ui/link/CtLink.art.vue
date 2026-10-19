<script setup lang="ts">
import CtHint from "../text/CtHint.vue";

defineArt("./CtLink.vue", {
  title: "CtLink",
  category: "Actions",
  description: "A way out to another page, as underlined words in a line, a thumb's height to hit",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: 12px;
  max-width: 420px;
}

.line {
  margin: 0;
  display: flex;
  gap: 12px;
  font-size: var(--font-sm);
  color: var(--muted);
}
</style>

<art>
  <variant default name="In a line, and quiet">
    <div class="stack">
      <p class="line">
        NT$500
        <CtLink href="https://maps.google.com/">Map</CtLink>
        <CtLink href="https://example.com/">example.com</CtLink>
      </p>
      <CtHint size="sm"><CtLink href="https://maps.google.com/" quiet>Open in Google Maps</CtLink></CtHint>
      <p class="line">
        The main shop has a queue; see
        <CtLink href="https://www.dintaifung.com.tw/" inline>https://www.dintaifung.com.tw/</CtLink>
        for the hours.
      </p>
    </div>
  </variant>
</art>
