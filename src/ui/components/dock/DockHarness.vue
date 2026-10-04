<script setup lang="ts" vapor>
import CtDock from "./CtDock.vue";
import CtDockDivider from "./CtDockDivider.vue";
import CtDockGroup from "./CtDockGroup.vue";
import CtDockItem from "./CtDockItem.vue";
import { state } from "./harness";

/** A dock as the app has one (App.vue), for dock.browser.test.ts: a link, a group of tabs, a setting */
const tabs = ["home", "canvas", "map"];
</script>

<template>
  <CtDock label="menu">
    <CtDockItem label="trips" :current="state.current === 'trips'" href="/" />
    <CtDockGroup :open="state.open">
      <CtDockItem v-for="t in tabs" :key="t" :label="t" :current="state.current === t" />
    </CtDockGroup>
    <CtDockDivider />
    <CtDockItem label="theme" />
  </CtDock>
</template>
