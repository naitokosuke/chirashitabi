<script setup lang="ts" vapor>
import { useTags } from "./store";
const tags = useTags();
defineProps<{ room: string }>();
function setMode(mode: "dim" | "only") {
  tags.mode = mode;
}
function clearTags() {
  tags.selected.clear();
}
</script>

<template>
  <div class="bar">
    <div class="row">
      <h1>chirashitabi<span v-if="room" class="room">{{ room }}</span></h1>
      <div aria-label="How to filter" class="mode" role="group">
        <button type="button" :class="{ on: tags.mode === 'dim' }" @click="() => setMode('dim')">Dim</button>
        <button type="button" :class="{ on: tags.mode === 'only' }" @click="() => setMode('only')">Only</button>
      </div>
    </div>
    <div class="chips">
      <button v-if="tags.selected.size" class="chip clear" type="button" @click="clearTags">× Clear</button>
      <button
        v-for="t in tags.tagList"
        :key="t.name"
        class="chip"
        type="button"
        :class="{ on: tags.selected.has(t.name) }"
        :style="`--tag:${t.color}`"
        @click="() => tags.toggleTag(t.name)"
      >#{{ t.name }}<span class="n">{{ t.count }}</span></button>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  z-index: var(--z-chrome);
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  margin: 0;
  font-size: var(--font-2xl);
  font-weight: 900;
  color: var(--red);
  background: var(--bg);
  padding: 4px 10px;
  border-radius: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.room {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
}

.mode {
  display: flex;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  margin-inline-start: auto;

  & button {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);

    &.on {
      background: var(--ink);
      color: var(--bg);
    }
  }
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip.clear {
  color: var(--muted);
  border-style: dashed;
}
</style>
