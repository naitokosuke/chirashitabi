<script setup lang="ts" vapor>
import { useRoute } from "vue-router";

import Rooms from "../features/rooms/Rooms.vue";

import { useTrips } from "./useTrips";

/**
 * The trips, for both of their routes: `/` (the list, `(trips)/index.vue`) and `/new` (the
 * sheet making a trip over it, `(trips)/new.vue`). One page around the two, so moving between
 * them keeps the list as it is (its scroll) and the sheet slides in and out (Rooms.vue).
 */
const route = useRoute();
const { hrefOf, newHref, open, create, close, created } = useTrips();
</script>

<template>
  <Rooms
    :creating="route.name === '/(trips)/new'"
    :href-of
    :new-href
    @open="open"
    @create="create"
    @close="close"
    @created="created"
  />
</template>
