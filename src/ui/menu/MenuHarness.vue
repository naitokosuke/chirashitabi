<script setup lang="ts" vapor>
import CtMenu from "./CtMenu.vue";
import CtMenuItem from "./CtMenuItem.vue";

/** A card's menu as the desk has it (canvas.vue), one action disabled, for menu.browser.test.ts */
</script>

<template>
  <CtMenu label="Din Tai Fung" :x="0" :y="0">
    <CtMenuItem>Rewrite</CtMenuItem>
    <CtMenuItem disabled>Share</CtMenuItem>
    <CtMenuItem danger>Delete</CtMenuItem>
  </CtMenu>
</template>
