<script setup lang="ts" vapor>
import { computed } from "vue";

import { CtChip, CtSegmented, type CtOption } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import type { FilterMode } from "./types";
import { useTags } from "./useTags";

const tags = useTags();
const i18n = useI18n();
defineProps<{ room: string }>();

const modes = computed((): CtOption<FilterMode>[] => [
  { value: "dim", label: i18n.t("filter.dim") },
  { value: "only", label: i18n.t("filter.only") },
]);

function clearTags() {
  tags.selected.clear();
}
</script>

<template>
  <div class="bar">
    <div class="row">
      <h1>chirashitabi<span v-if="room" class="room">{{ room }}</span></h1>
      <CtSegmented v-model="tags.mode" class="mode" :label="i18n.t('filter.label')" :options="modes" />
    </div>
    <div class="chips">
      <CtChip v-if="tags.selected.size" class="clear" @click="clearTags">{{ i18n.t("filter.clear") }}</CtChip>
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
  /* room for the chips' shadow, and a fade at the end so a row that continues looks like it does */
  padding: 2px 24px 8px 2px;
  margin-inline: -2px;
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

/* A phone: the room name goes under the wordmark instead of beside it */
@media (width < 420px) {
  h1 {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
}

.clear {
  border-style: dashed;
}
</style>
