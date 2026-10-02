<script setup lang="ts" vapor>
import { CtChip, CtChipRow } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useTags } from "./useTags";

const tags = useTags();
const i18n = useI18n();

function clearTags() {
  tags.selected.clear();
}
</script>

<template>
  <CtChipRow>
    <CtChip v-if="tags.selected.size" class="clear" @click="clearTags">{{ i18n.t("filter.clear") }}</CtChip>
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
</template>

<style scoped>
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
