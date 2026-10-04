<script setup lang="ts" vapor>
import Rooms from "../features/rooms/Rooms.vue";

import { useTrips } from "./useTrips";

const { creating, hrefOf, newHref, open, create, close, created } = useTrips();
</script>

<template>
  <!-- the trips, with the sheet making a new one over them (Rooms.vue) -->
  <Rooms :creating :href-of :new-href @open="open" @create="create" @close="close" @created="created" />
</template>
