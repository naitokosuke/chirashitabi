<script setup lang="ts">
import CtHint from "../text/CtHint.vue";

defineArt("./CtDisclosure.vue", {
  title: "CtDisclosure",
  category: "Layout",
  description: "Something shown only when asked for, under a quiet line to tap",
  status: "ready",
});
</script>

<art>
  <variant default name="Closed">
    <CtDisclosure label="Show a QR code">
      <CtHint>Point the other phone's camera at it to open the app.</CtHint>
    </CtDisclosure>
  </variant>
</art>
