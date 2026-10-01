<script setup lang="ts" vapor>
import { useNotes } from "@/notes/store";
const store = useNotes();
</script>

<template>
  <div class="bar">
    <div class="row">
      <h1>ちらしたび<span class="room">台湾たび</span></h1>
      <div aria-label="絞り込みの見せ方" class="mode" role="group">
        <button :class="{ on: store.mode === 'dim' }" @click="store.mode = 'dim'">薄くする</button>
        <button :class="{ on: store.mode === 'only' }" @click="store.mode = 'only'">だけ表示</button>
      </div>
    </div>
    <div class="chips">
      <button v-if="store.selected.size" class="chip clear" @click="store.selected.clear()">× 解除</button>
      <button
        v-for="t in store.tagList"
        :key="t.name"
        class="chip"
        :class="{ on: store.selected.has(t.name) }"
        :style="`--tag:${t.color}`"
        @click="store.toggleTag(t.name)"
      >#{{ t.name }}<span class="n">{{ t.count }}</span></button>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 5;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.bar > * {
  pointer-events: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  margin: 0;
  font-size: 18px;
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
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.mode {
  display: flex;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  margin-left: auto;
}

.mode button {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.mode button.on {
  background: var(--ink);
  color: var(--bg);
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip.clear {
  color: var(--muted);
  border-style: dashed;
}
</style>
