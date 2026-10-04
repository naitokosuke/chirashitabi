<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { CtSwatches } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { datesLabel, whenLabel } from "./label";
import { MEMBER_COLORS, profileOf } from "./newRoom";
import TripTag from "./TripTag.vue";
import type { RoomId, RoomSummary } from "./types";
import { useRooms } from "./useRooms";
import { whenOf } from "./when";

/**
 * A trip someone invited this person to, on the list of trips: its tag, who it is from, and
 * the answer. Joining asks what color they will wear in the room, as making a trip does (no
 * name: people are told apart by color alone, for now); the color offered first is one the
 * trip's people do not wear yet.
 */
const props = defineProps<{ room: RoomSummary }>();
const emit = defineEmits<{ joined: [room: RoomId] }>();

const i18n = useI18n();
const today = Temporal.Now.plainDateISO();

const taken = new Set(props.room.members.map((m) => m.color.toLowerCase()));
const color = ref<string>(MEMBER_COLORS.find((c) => !taken.has(c)) ?? MEMBER_COLORS[0]);
const profile = computed(() => profileOf(color.value));

/** The owner leads the trip's people (worker/room.ts): the invitation is from their color */
const from = computed(() => props.room.members.find((m) => m.kind === "person")?.color);
const tag = computed(() => ({
  name: props.room.name,
  dates: datesLabel(props.room.first, props.room.days, i18n.locale, i18n.t),
  when: whenLabel(whenOf(props.room, today), i18n.t),
  members: props.room.members,
}));

const { accept, decline } = useRooms();
const busy = computed(() => accept.isLoading.value || decline.isLoading.value);
const failed = ref<"join" | "decline" | null>(null);

async function join() {
  const p = profile.value;
  if (p === null || busy.value) return;
  failed.value = null;
  try {
    await accept.mutateAsync({ room: props.room.id, me: p });
    emit("joined", props.room.id);
  } catch {
    failed.value = "join";
  }
}
async function no() {
  if (busy.value) return;
  failed.value = null;
  try {
    await decline.mutateAsync(props.room.id);
  } catch {
    failed.value = "decline";
  }
}
</script>

<template>
  <form class="invitation" @submit.prevent="join">
    <p class="from">
      <span v-if="from" aria-hidden="true" :style="`--who: ${from}`"></span>{{ i18n.t("rooms.invited") }}
    </p>
    <TripTag v-bind="tag" />

    <div class="field">
      <span>{{ i18n.t("rooms.color") }}</span>
      <CtSwatches
        :colors="MEMBER_COLORS"
        :selected="color"
        :label="i18n.t('rooms.color')"
        @select="(c) => (color = c)"
      />
    </div>

    <p v-if="failed !== null" role="alert">
      {{ i18n.t(failed === "join" ? "rooms.joinFailed" : "rooms.declineFailed") }}
    </p>
    <div class="answer">
      <button class="primary" type="submit" :disabled="busy || profile === null">
        {{ i18n.t(accept.isLoading.value ? "rooms.joining" : "rooms.join") }}
      </button>
      <button type="button" :disabled="busy" @click="no">{{ i18n.t("rooms.decline") }}</button>
    </div>
  </form>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

/* the tag handed over on a card: the tag, then who one will be in the trip */
.invitation {
  display: grid;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  > p {
    margin: 0;
    font-size: var(--font-sm);
    color: var(--ink);
  }
  /* who it is from: their dot, as on the tag */
  > .from {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: var(--muted);

    > span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--who);
    }
  }
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
  > label,
  > span {
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
  }
  > input {
    min-height: 46px;
    padding: 10px 12px;
    font: inherit;
    font-size: var(--font-lg);
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}

.answer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > button {
    min-height: 46px;
    padding: 0 18px;
    border-radius: 999px;
    border: 0;
    background: var(--wash);
    color: var(--ink);
    font: inherit;
    font-size: var(--font-base);
    font-weight: 700;
    &:disabled {
      opacity: 0.35;
    }
    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 3px;
    }
  }
  > .primary {
    flex: 1;
    background: var(--ink);
    color: var(--on-ink);
    @media (--can-hover) {
      &:not(:disabled):hover {
        box-shadow: var(--shadow-float);
      }
    }
  }
}
</style>
