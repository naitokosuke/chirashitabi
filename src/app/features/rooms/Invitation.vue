<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";

import { CtAvatar, CtButton, CtField, CtSwatches } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useOffline } from "../sync/useOffline";

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
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
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
      <CtAvatar v-if="from !== undefined" :color="from" size="dot" />{{ i18n.t("rooms.invited") }}
    </p>
    <TripTag v-bind="tag" />

    <CtField :label="i18n.t('rooms.color')">
      <CtSwatches v-model="color" :colors="MEMBER_COLORS" :label="i18n.t('rooms.color')" />
    </CtField>

    <p v-if="failed !== null" role="alert">
      {{ i18n.t(failed === "join" ? "rooms.joinFailed" : "rooms.declineFailed") }}
    </p>
    <div class="answer">
      <CtButton
        class="join"
        size="lg"
        type="submit"
        variant="primary"
        :disabled="busy || profile === null || cut.offline"
      >
        {{ i18n.t(accept.isLoading.value ? "rooms.joining" : "rooms.join") }}
      </CtButton>
      <CtButton size="lg" :disabled="busy || cut.offline" @click="no">{{
        i18n.t("rooms.decline")
      }}</CtButton>
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
  }
}

.answer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > .join {
    flex: 1;
  }
}
</style>
