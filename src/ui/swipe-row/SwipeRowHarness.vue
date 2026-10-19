<script setup lang="ts" vapor>
import CtSwipeRow from "./CtSwipeRow.vue";
import { state } from "./harness";

/** A row as the list of trips has one (Rooms.vue): a link, and the way off the list behind it */
</script>

<template>
  <CtSwipeRow :open="state.open" @toggle="(toOpen) => (state.open = toOpen)">
    <template #default>
      <a class="tag" href="#trip">Taiwan trip</a>
    </template>
    <template #actions>
      <button class="off" type="button" @click="() => state.taken++">Delete</button>
    </template>
  </CtSwipeRow>
</template>

<style scoped>
.tag {
  display: block;
  padding: var(--space-12);
  background: var(--surface);
}

.off {
  min-inline-size: var(--size-swipe-action);
}
</style>
