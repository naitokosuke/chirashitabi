<script setup lang="ts" vapor>
import { computed } from "vue";

import type { MessageId, MessageParams } from "./types";
import { useI18n } from "./useI18n";

const props = defineProps<{ id: MessageId; params?: MessageParams }>();
// one slot per markup name: `{#date}…{/date}` renders `<template #date="{ text }">`
defineSlots<Record<string, (props: { text: string }) => unknown>>();
const i18n = useI18n();
const segments = computed(() => i18n.parts(props.id, props.params));
</script>

<template>
  <template v-for="s in segments" :key="s.at">
    <template v-if="s.kind === 'text'">{{ s.text }}</template>
    <slot v-else :name="s.name" :text="s.text">{{ s.text }}</slot>
  </template>
</template>
