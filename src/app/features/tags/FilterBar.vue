<script setup lang="ts" vapor>
import { CtChip, CtChipRow } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useTags } from "./useTags";

const tags = useTags();
const i18n = useI18n();

function clearTags() {
  tags.selected.clear();
}
/** Off: the other notes are dimmed; on: only the picked tags' notes are left on the desk */
function toggleOnly() {
  tags.mode = tags.mode === "only" ? "dim" : "only";
}
</script>

<template>
  <div class="filter">
    <CtChipRow>
      <CtChip
        v-for="t in tags.tagList"
        :key="t.name"
        toggle
        :selected="tags.selected.has(t.name)"
        :count="t.count"
        @click="() => tags.toggleTag(t.name)"
      >#{{ t.name }}</CtChip>
      <p v-if="tags.tagList.length === 0" class="none">{{ i18n.t("filter.none") }}</p>
    </CtChipRow>
    <!--
      Outside the row, at its end, and only while a tag is picked (they mean nothing before):
      appearing narrows the row, it never pushes a chip along.
    -->
    <div v-if="tags.selected.size" class="picked">
      <CtChip toggle :selected="tags.mode === 'only'" @click="toggleOnly">{{ i18n.t("filter.only") }}</CtChip>
      <CtChip class="clear" @click="clearTags">{{ i18n.t("filter.clear") }}</CtChip>
    </div>
  </div>
</template>

<style scoped>
.filter {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.picked {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding-inline-end: 12px;
}

.clear {
  border-style: dashed;
}

.none {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--muted);
  white-space: nowrap;
}
</style>
