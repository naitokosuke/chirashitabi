<script setup lang="ts">
defineArt("./CtPaper.vue", {
  title: "CtPaper",
  category: "Paper",
  description:
    "A piece of paper on the desk in its writer's paper: a person's sticky (soft corner), the agent's slip (cut square), or a print (a picture in a wide mount)",
  status: "ready",
});
</script>

<art>
  <variant default name="Note">
    <CtPaper paper="color-mix(in oklab, #3c6ee0 28%, var(--paper-white))">
      <p style="margin: 0; font-weight: 700">Din Tai Fung xiaolongbao</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: var(--paper-muted)">The main shop has a queue</p>
      <template #foot><small style="margin-inline-start: auto">11/3 12:30</small></template>
    </CtPaper>
  </variant>
  <variant name="Proposal">
    <CtPaper paper="color-mix(in oklab, #d97757 28%, var(--paper-white))" variant="proposal">
      <template #strip>Suggestion</template>
      <p style="margin: 0; font-weight: 700">Shaved ice on Yongkang Street after Taipei 101</p>
      <template #foot><button aria-label="Dismiss" type="button">👎</button><button
          aria-label="Keep it"
          type="button"
        >👍</button></template>
    </CtPaper>
  </variant>
  <variant name="Print">
    <CtPaper paper="color-mix(in oklab, #d7263d 28%, var(--paper-white))" variant="print">
      <template #picture><div
          style="aspect-ratio: 16 / 9; background: linear-gradient(135deg, #5b8def, #e36d7a)"
        ></div></template>
      <template #default><b>A night market walk in Shilin</b></template>
      <template #foot><span>youtube.com</span></template>
    </CtPaper>
  </variant>
  <variant name="Selected">
    <CtPaper paper="color-mix(in oklab, #1b998b 28%, var(--paper-white))" selected>
      <p style="margin: 0; font-weight: 700">Picked</p>
    </CtPaper>
  </variant>
</art>
