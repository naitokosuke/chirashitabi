<script setup lang="ts">
defineArt("./CtFab.vue", {
  title: "CtFab",
  category: "Actions",
  description: "The one filled tool on a view, at its bottom end above the dock",
  status: "ready",
});
</script>

<style scoped>
.view {
  position: relative;
  height: 240px;
  border-radius: 12px;
  background: var(--wash);
}
</style>

<art>
  <variant default name="On a view">
    <!-- the view it sits in; CtFab places itself against it -->
    <div class="view">
      <CtFab label="Write a note">
        <svg
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </CtFab>
    </div>
  </variant>
</art>
