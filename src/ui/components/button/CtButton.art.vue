<script setup lang="ts">
defineArt("./CtButton.vue", {
  title: "CtButton",
  category: "Actions",
  description:
    "A pill to press: quiet, primary (ink), ask (the agent's, dashed) or blank (still to add)",
  status: "ready",
});
</script>

<art>
  <variant default name="Quiet">
    <CtButton>Cancel</CtButton>
  </variant>
  <variant name="Primary">
    <CtButton variant="primary">Save</CtButton>
  </variant>
  <variant name="Primary, large">
    <CtButton size="lg" variant="primary">Create the trip</CtButton>
  </variant>
  <variant name="Ask">
    <CtButton variant="ask">Ask Clef for tags</CtButton>
  </variant>
  <variant name="Ask, waiting">
    <CtButton busy variant="ask">Asking Clef…</CtButton>
  </variant>
  <variant name="Blank">
    <CtButton variant="blank">Add a stay</CtButton>
  </variant>
  <variant name="Disabled">
    <CtButton disabled variant="primary">Save</CtButton>
  </variant>
</art>
