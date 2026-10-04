<script setup lang="ts" vapor>
import { computed } from "vue";

import { useRoute } from "vue-router";

import { usePlace } from "../../../features/canvas/usePlace";
import Form from "../../../features/notes/Form.vue";
import type { NoteInput } from "../../../features/notes/types";
import { queryStrings, sheetOf } from "../url";

/**
 * The memo tab is the canvas's form, always open: each save goes on the canvas and only there,
 * quietly, and the toast says so and offers the undo
 */
const route = useRoute();
const place = usePlace();
/** Live while it is the tab up with no sheet over it */
const active = computed(
  () => route.name === "/rooms/[roomId]/memo" && sheetOf(queryStrings(route.query)) === null,
);
const saved = (input: NoteInput) => void place(input, "away");
</script>

<template>
  <Form :mode="{ kind: 'tab', active }" @save="saved" />
</template>
