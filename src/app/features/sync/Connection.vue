<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

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
    coming back after a drop. The data stays usable meanwhile, so this is a quiet chip over the
    view, never a cover. Once the socket gives up, the band along the top says so (Offline.vue).
  -->
  <div aria-live="polite">
    <p v-if="link === 'connecting' || link === 'reconnecting'">
      <span aria-hidden="true"></span>{{ i18n.t("room.reconnecting", { time: since }) }}
    </p>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

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

    /* breathing while it reconnects */
    > span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      animation: breathe 1s ease-in-out infinite alternate;

      @media (--reduced-motion) {
        animation: none;
      }
    }

  }
}

@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}
</style>
