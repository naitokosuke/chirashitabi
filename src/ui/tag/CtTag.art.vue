<script setup lang="ts">
defineArt("./CtTag.vue", {
  title: "CtTag",
  category: "Paper",
  description: "A trip's luggage tag: to come in ink, over in white, blank to write, or waiting",
  status: "ready",
});

const MEMBERS = [
  { kind: "person" as const, name: "Yuki", color: "#5b7fd6" },
  { kind: "agent" as const, name: "Claude", color: "#d97757" },
];
</script>

<style scoped>
.stack {
  display: grid;
  gap: 12px;
  max-width: 480px;
}

a {
  display: block;
  border-radius: 12px 20px 20px 12px;
  color: inherit;
  text-decoration: none;
}
</style>

<art>
  <variant default name="Every state">
    <div class="stack">
      <a aria-label="Taiwan trip, in 15 days" href="/rooms/demo/canvas">
        <CtTag
          dates="11/3 (Tue) – 11/6 (Fri) · 4 days"
          :members="MEMBERS"
          memos="14 notes"
          name="Taiwan trip"
          when="in 15 days"
        />
      </a>
      <CtTag dates="9/1 – 9/3 · 3 days" :members="MEMBERS" name="Kyoto" past when="" />
      <a href="/new"><CtTag variant="blank">+ New trip</CtTag></a>
      <CtTag variant="loading" />
    </div>
  </variant>
</art>
