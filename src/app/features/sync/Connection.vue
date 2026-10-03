<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { useI18n } from "../../i18n/useI18n";

import { hhmm } from "../trip/format";

import { useRoom } from "./useRoom";

const room = useRoom();
const i18n = useI18n();

/** "12:30": when what is on screen was last known to be the room's */
const since = computed(() => {
  const at = room.syncedAt;
  return at === null ? "" : hhmm(at.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainTime());
});
</script>

<template>
  <!--
    Inside a room, the socket coming back. The data on screen stays usable meanwhile, so this
    is a quiet chip over the view, never a cover. Giving up leaves the room for the rooms
    screen, which says so and offers to retry.
  -->
  <div aria-live="polite" class="connection">
    <p v-if="room.status === 'reconnecting'" class="chip">
      <span aria-hidden="true" class="dot"></span>{{ i18n.t("room.reconnecting", { time: since }) }}
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
