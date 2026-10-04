<script setup lang="ts" vapor>
import Rooms from "../features/rooms/Rooms.vue";

import { useTrips } from "./useTrips";

const { creating, hrefOf, newHref, open, create, close, created } = useTrips();
</script>

<template>
  <Rooms :creating :href-of :new-href @open="open" @create="create" @close="close" @created="created" />
</template>
