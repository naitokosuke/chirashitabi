<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { hhmm, shortDate } from "../trip/format";

import { useRoom } from "./useRoom";

const room = useRoom();
const i18n = useI18n();

/** "12:30", or "11/2 12:30" from another day: when what is on screen was last the room's */
const since = computed(() => {
  const at = room.syncedAt;
  if (at === null) return "";
  const local = at.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const time = hhmm(local.toPlainTime());
  return local.toPlainDate().equals(Temporal.Now.plainDateISO())
    ? time
    : `${shortDate(local.toPlainDate(), i18n.locale)} ${time}`;
});
</script>

<template>
  <!--
    Inside a room, whenever what is on screen is not live: opening from what this device kept,
    coming back after a drop, or unreachable. The data stays usable meanwhile, so this is a
    quiet chip over the view, never a cover.
  -->
  <div aria-live="polite" class="connection">
    <p v-if="room.status === 'connecting' || room.status === 'reconnecting'" class="chip">
      <span aria-hidden="true" class="dot"></span>{{ i18n.t("room.reconnecting", { time: since }) }}
    </p>
    <p v-else-if="room.status === 'failed'" class="chip">
      {{ i18n.t("room.unreachable", { time: since }) }}
      <button type="button" @click="() => room.reconnect()">{{ i18n.t("rooms.retry") }}</button>
    </p>
  </div>
</template>

<style scoped>
/* below the app bar, centred; it covers a strip of the view only while the socket is down */
.connection {
  position: absolute;
  inset-inline: 0;
  inset-block-start: calc(env(safe-area-inset-top, 0px) + var(--bar) + 8px);
  z-index: var(--z-menu);
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.chip {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-float);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  pointer-events: auto;
  & button {
    min-height: 32px;
    padding: 0 4px;
    color: var(--ink);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: breathe 1s ease-in-out infinite alternate;
}

@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}
</style>
