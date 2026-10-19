<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { CtBadge } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { hhmm, shortDate } from "../trip/format";

import { useSync } from "./useSync";

const sync = useSync();
const i18n = useI18n();

/** The socket, while in a room; this chip is shown only there */
const link = computed(() => (sync.session.kind === "in" ? sync.session.link : null));
/** "12:30", or "11/2 12:30" from another day: when what is on screen was last the room's */
const since = computed(() => {
  if (sync.session.kind !== "in") return "";
  const local = sync.session.syncedAt.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const time = hhmm(local.toPlainTime());
  return local.toPlainDate().equals(Temporal.Now.plainDateISO())
    ? time
    : `${shortDate(local.toPlainDate(), i18n.locale)} ${time}`;
});
</script>

<template>
  <!--
    Inside a room, while the socket is on its way: opening from what this device kept, or
    coming back after a drop. The data stays usable meanwhile, so this is a quiet badge over the
    view, its dot breathing, never a cover. Once the socket gives up, the band along the top says
    so (Offline.vue).
  -->
  <div aria-live="polite">
    <CtBadge v-if="link === 'connecting' || link === 'reconnecting'" as="p" busy float>{{
      i18n.t("room.reconnecting", { time: since })
    }}</CtBadge>
  </div>
</template>

<style scoped>
/* under the row where tools float, centred; it covers a strip of the view only while the socket is down */
div {
  position: absolute;
  inset-inline: 0;
  inset-block-start: var(--top-clear);
  z-index: var(--z-menu);
  display: flex;
  justify-content: center;
  pointer-events: none;

  > p {
    pointer-events: auto;
  }
}
</style>
