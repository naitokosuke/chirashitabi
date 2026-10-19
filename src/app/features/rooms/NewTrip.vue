<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onMounted, ref, useId, useTemplateRef } from "vue";

import {
  CtBackButton,
  CtButton,
  CtChipPick,
  CtCalendar,
  CtField,
  CtHeading,
  CtHint,
  CtInput,
  CtMessage,
  CtSwatches,
  type CtDateRange,
  type CtOption,
  lengthOf,
} from "../../../ui/index";

import { hexColor } from "../../shared/color";

import { useI18n } from "../../i18n/useI18n";

import backIcon from "../../icons/back.svg";
import Icon from "../../icons/Icon.vue";
import { useOffline } from "../sync/useOffline";
import { longDate } from "../trip/format";

import { datesLabel, whenLabel } from "./label";
import { CURRENCIES, DEFAULT_CENTER, MAX_DAYS, MAX_NAME, MEMBER_COLORS, newRoom } from "./newRoom";
import TripTag from "./TripTag.vue";
import type { RoomId, RoomSummary } from "./types";
import { useRooms } from "./useRooms";
import { whenOf } from "./when";

const emit = defineEmits<{ close: []; created: [room: RoomId] }>();

const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const id = useId();
const today = Temporal.Now.plainDateISO();

const name = ref("");
const start = today.add({ days: 30 });
const dates = ref<CtDateRange>({ start, end: start.add({ days: 3 }) });
/** How many days the trip runs, 0 while its last day is still to be picked */
const count = computed(() => lengthOf(dates.value) ?? 0);
const currency = ref<string>(CURRENCIES[0]);
const currencies: CtOption[] = CURRENCIES.map((c) => ({ value: c, label: c }));
const color = ref<string>(MEMBER_COLORS[0]);

/** The form as a room the Worker will take, or null while it is not one yet */
const filled = computed(() =>
  newRoom(
    {
      name: name.value,
      firstDay: dates.value.start.toString(),
      days: count.value,
      currency: currency.value,
      color: color.value,
    },
    DEFAULT_CENTER,
  ),
);

/** The tag the trip will get, drawn as the form is filled in */
const preview = computed(() => {
  // the person, nameless, in their color; and the agent, in every trip from the start (worker/room.ts)
  const members: RoomSummary["members"] = [
    { kind: "person" as const, name: "", color: hexColor(color.value) },
    { kind: "agent" as const, name: "Claude", color: hexColor("#d97757") },
  ].flatMap((m) => (m.color === null ? [] : [{ ...m, color: m.color }]));
  const typed = name.value.trim();
  return {
    name: typed === "" ? i18n.t("rooms.namePlaceholder") : typed,
    unnamed: typed === "",
    // while the last day is to be picked, the first one, open-ended
    dates:
      count.value === 0
        ? `${longDate(dates.value.start, i18n.locale)} –`
        : datesLabel(dates.value.start, count.value, i18n.locale, i18n.t),
    when: whenLabel(
      whenOf({ first: dates.value.start, days: count.value === 0 ? 1 : count.value }, today),
      i18n.t,
    ),
    members,
  };
});

const { mutateAsync, isLoading: busy, error } = useRooms().create;
async function create() {
  const room = filled.value;
  if (busy.value || room === null) return;
  try {
    emit("created", await mutateAsync(room));
  } catch {
    // the mutation's error state says so above the button; the person tries again
  }
}

const nameEl = useTemplateRef<{ focus(): void }>("nameEl");
onMounted(() => nameEl.value?.focus());
</script>

<template>
  <form class="sheet" @submit.prevent="create">
    <!-- no bar: the way back floats where a bar would be; the title opens the page -->
    <CtBackButton @click="() => emit('close')">
      <Icon :size="16" :src="backIcon" />{{ i18n.t("home.trips") }}
    </CtBackButton>

    <div class="body">
      <CtHeading level="sheet">{{ i18n.t("rooms.new") }}</CtHeading>
      <!-- the tag as it will hang on the trip; the fields below say the same to a screen reader -->
      <TripTag
        aria-hidden="true"
        class="preview"
        :name="preview.name"
        :unnamed="preview.unnamed"
        :dates="preview.dates"
        :when="preview.when"
        :members="preview.members"
      />

      <CtField :for="`${id}-name`" :label="i18n.t('rooms.name')">
        <CtInput
          :id="`${id}-name`"
          ref="nameEl"
          v-model="name"
          :maxlength="MAX_NAME"
          enterkeyhint="done"
          required
          :placeholder="i18n.t('rooms.namePlaceholder')"
        />
      </CtField>

      <CtField :label="i18n.t('rooms.dates')">
        <template #note>
          <span v-if="dates.end === null" aria-live="polite">{{ i18n.t("rooms.pickLast") }}</span>
        </template>
        <template #default>
          <CtCalendar
            v-model:range="dates"
            :max-days="MAX_DAYS"
            :locale="i18n.locale"
            :prev-label="i18n.t('rooms.prevMonth')"
            :next-label="i18n.t('rooms.nextMonth')"
          />
        </template>
      </CtField>

      <CtField :label="i18n.t('rooms.currency')">
        <CtChipPick v-model="currency" :options="currencies" :label="i18n.t('rooms.currency')" />
      </CtField>

      <!-- no name for the person: told apart by color alone, for now -->
      <CtField :label="i18n.t('rooms.color')">
        <CtSwatches v-model="color" :colors="MEMBER_COLORS" :label="i18n.t('rooms.color')" />
      </CtField>
    </div>

    <footer>
      <CtMessage v-if="error !== null" role="alert">{{ i18n.t("rooms.createFailed") }}</CtMessage>
      <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
      <CtButton
        size="lg"
        type="submit"
        variant="primary"
        :disabled="busy || filled === null || cut.offline"
      >
        {{ i18n.t(busy ? "rooms.creating" : "rooms.create") }}
      </CtButton>
    </footer>
  </form>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

.sheet {
  position: absolute;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--top-clear) var(--page-margin) 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* the tag rests on the desk above the fields, with room under it before the first one */
.preview {
  margin-block-end: 10px;
}

/* the one action, always in reach under the fields */
footer {
  flex-shrink: 0;
  display: grid;
  gap: 8px;
  padding: 12px var(--page-margin) calc(12px + env(safe-area-inset-bottom, 0px));
  border-block-start: 1px solid var(--line);
  background: var(--bg);
}
</style>
