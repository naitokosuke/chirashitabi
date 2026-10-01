<script setup lang="ts" vapor>
import { useNotes } from "@/notes/store";
const store = useNotes();
function setMode(mode: "dim" | "only") {
  store.mode = mode;
}
function clearTags() {
  store.selected.clear();
}
</script>

<template>
  <div class="bar">
    <div class="row">
      <h1>ちらしたび<span class="room">台湾たび</span></h1>
      <div aria-label="絞り込みの見せ方" class="mode" role="group">
        <button type="button" :class="{ on: store.mode === 'dim' }" @click="() => setMode('dim')">薄くする</button>
        <button type="button" :class="{ on: store.mode === 'only' }" @click="() => setMode('only')">だけ表示</button>
      </div>
    </div>
    <div class="chips">
      <button v-if="store.selected.size" class="chip clear" type="button" @click="clearTags">× 解除</button>
      <button
        v-for="t in store.tagList"
        :key="t.name"
        class="chip"
        type="button"
        :class="{ on: store.selected.has(t.name) }"
        :style="`--tag:${t.color}`"
        @click="() => store.toggleTag(t.name)"
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
