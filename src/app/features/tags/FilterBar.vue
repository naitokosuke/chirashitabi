<script setup lang="ts" vapor>
import { CtChip, CtSegmented, type CtOption } from "../../../ui/index";

import type { FilterMode } from "./types";
import { useTags } from "./useTags";

const tags = useTags();
defineProps<{ room: string }>();

const MODES = [
  { value: "dim", label: "Dim" },
  { value: "only", label: "Only" },
] as const satisfies readonly CtOption<FilterMode>[];

function clearTags() {
  tags.selected.clear();
}
</script>

<template>
  <div class="bar">
    <div class="row">
      <h1>chirashitabi<span v-if="room" class="room">{{ room }}</span></h1>
      <CtSegmented v-model="tags.mode" class="mode" label="How to filter" :options="MODES" />
    </div>
    <div class="chips">
      <CtChip v-if="tags.selected.size" class="clear" @click="clearTags">× Clear</CtChip>
      <CtChip
        v-for="t in tags.tagList"
        :key="t.name"
        toggle
        :color="t.color"
        :selected="tags.selected.has(t.name)"
        :count="t.count"
        @click="() => tags.toggleTag(t.name)"
      >#{{ t.name }}</CtChip>
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
  margin-inline-start: auto;
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

.clear {
  border-style: dashed;
}
</style>
