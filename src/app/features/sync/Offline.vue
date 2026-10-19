<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onMounted, watch } from "vue";

import { CtBanner, CtButton } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { hhmm, shortDate } from "../trip/format";

import { useOffline } from "./useOffline";
import { useRoom } from "./useRoom";
import { useSync } from "./useSync";

/**
 * The band along the very top of every screen while this device is cut off: in a room, as of
 * when what is on screen was last the room's, and a way to try again; out of one, only that it
 * is. Everything floating along the top moves down under it (tokens.css, --top-inset).
 */
const cut = useOffline();
const room = useRoom();
const sync = useSync();
const i18n = useI18n();

const mark = (offline: boolean) => {
  const root = document.documentElement;
  if (offline) root.dataset.offline = "";
  else delete root.dataset.offline;
};
onMounted(() => mark(cut.offline));
watch(() => cut.offline, mark);

/** "12:30", or "11/2 12:30" from another day: when what is on screen was last the room's; "" out of a room */
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
  <!-- the live region stays, so the band coming is read out; online, nothing of it is on the page -->
  <div role="status">
    <CtBanner v-if="cut.offline" class="band">
      <template #default>{{
        since === "" ? i18n.t("offline.out") : i18n.t("offline.in", { time: since })
      }}</template>
      <template v-if="since !== ''" #action>
        <CtButton variant="text" @click="room.reconnect">{{ i18n.t("rooms.retry") }}</CtButton>
      </template>
    </CtBanner>
  </div>
</template>

<style scoped>
/* the strip the status bar leaves, and the band's own height, over everything, a sheet too */
.band {
  position: fixed;
  inset-inline: 0;
  inset-block-start: 0;
  z-index: var(--z-notice);
  height: var(--top-inset);
  line-height: calc(var(--notice) - 4px);
}
</style>
