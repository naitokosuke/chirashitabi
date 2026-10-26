<script setup lang="ts" vapor>
import { useRoute } from "vue-router";

import { usePlace } from "../../../features/canvas/usePlace";
import Form from "../../../features/notes/Form.vue";
import type { NoteInput } from "../../../features/notes/types";
import { sheetOf } from "../url";

/**
 * The memo tab is the canvas's form, always open: each save goes on the canvas and only there,
 * quietly, and the toast says so and offers the undo
 */
const route = useRoute();
const place = usePlace();
const saved = (input: NoteInput) => void place(input, "away");
</script>

<template>
  <!-- live while it is the tab up with no sheet over it -->
  <Form
    :mode="{
      kind: 'tab',
      active: route.name === '/rooms/[roomId=roomId]/memo' && sheetOf(route.params) === null,
    }"
    @save="saved"
  />
</template>
