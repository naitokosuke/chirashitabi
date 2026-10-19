<script setup lang="ts">
defineArt("./CtAmount.vue", {
  title: "CtAmount",
  category: "Data",
  description:
    "A sum in bold, what it is before it and what it would come to with the maybes after it",
  status: "ready",
});
</script>

<style scoped>
.stack {
  display: grid;
  gap: 16px;
  max-width: 420px;
}
</style>

<art>
  <variant default name="A budget and a day's total">
    <div class="stack">
      <CtAmount aside="(NT$3,700 with maybes)" label="Budget" size="lg" value="NT$2,600" />
      <CtAmount aside="(NT$1,500 with maybes)" value="This day NT$1,100" />
    </div>
  </variant>
</art>
