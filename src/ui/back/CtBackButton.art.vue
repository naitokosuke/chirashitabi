<script setup lang="ts">
defineArt("./CtBackButton.vue", {
  title: "CtBackButton",
  category: "Actions",
  description: "The way back from a sheet: glass, at the start of the row where a bar would be",
  status: "ready",
});
</script>

<style scoped>
.sheet {
  position: relative;
  height: var(--stage-short);
  border-radius: var(--radius-6);
  background: var(--bg);
}
</style>

<art>
  <variant default name="On a sheet">
    <!-- the sheet it floats on; CtBackButton places itself against it -->
    <div class="sheet">
      <CtBackButton>
        <svg
          aria-hidden="true"
          fill="none"
          height="16"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="16"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Trips
      </CtBackButton>
    </div>
  </variant>
</art>
