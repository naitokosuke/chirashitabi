<script setup lang="ts">
defineArt("./CtPaper.vue", {
  title: "CtPaper",
  category: "Paper",
  description:
    "A piece of paper on the desk: a sticky (note), a slip from the agent (proposal), or a page brought in (print); one size, corner and shadow",
  status: "ready",
});
</script>

<art>
  <variant default name="Note">
    <CtPaper paper="var(--paper-yellow)" who="#3c6ee0">
      <p style="margin: 0; font-weight: 700">Din Tai Fung xiaolongbao</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: var(--paper-muted)">The main shop has a queue</p>
      <template #foot><small>11/3 12:30</small></template>
    </CtPaper>
  </variant>
  <variant name="Proposal">
    <CtPaper variant="proposal" who="#d97757">
      <template #strip>Claude · suggestion</template>
      <p style="margin: 0; font-weight: 700">Shaved ice on Yongkang Street after Taipei 101</p>
      <template #foot><button type="button">Keep it</button><button type="button">Dismiss</button></template>
    </CtPaper>
  </variant>
  <variant name="Print">
    <CtPaper variant="print" who="#3c6ee0">
      <template #picture><div
          style="aspect-ratio: 16 / 9; background: linear-gradient(135deg, #5b8def, #e36d7a)"
        ></div></template>
      <template #margin><span>youtube.com</span></template>
    </CtPaper>
  </variant>
  <variant name="Selected">
    <CtPaper paper="var(--paper-mint)" selected who="#d7263d">
      <p style="margin: 0; font-weight: 700">Picked</p>
    </CtPaper>
  </variant>
</art>
