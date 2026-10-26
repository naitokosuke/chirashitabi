<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onMounted, ref, shallowRef, useId, useTemplateRef } from "vue";

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
  CtSheet,
  CtSwatches,
  CtTag,
  type CtDateRange,
  lengthOf,
} from "../../../ui/index";

import type { MessageId } from "../../i18n/types";
import { useI18n } from "../../i18n/useI18n";

import { parseHexColor } from "../../../contract";
import { MAX_DAYS, MAX_NAME } from "../../../contract/room";
import backIcon from "../../icons/back.svg";
import Icon from "../../icons/Icon.vue";
import { useOffline } from "../sync/useOffline";
import { longDate } from "../trip/format";

import type { CreateRefusal } from "./api";
import { datesLabel, whenLabel } from "./label";
import { CURRENCIES, DEFAULT_CENTER, MEMBER_COLORS, newRoom } from "./newRoom";
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
const currency = ref<(typeof CURRENCIES)[number]>(CURRENCIES[0]);
const currencies = CURRENCIES.map((c) => ({ value: c, label: c }));
const color = ref<(typeof MEMBER_COLORS)[number]>(MEMBER_COLORS[0]);

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
  // the person, nameless, in their color; and the agent, in every trip from the start (src/worker/room.ts)
  const members: RoomSummary["members"] = [
    { kind: "person" as const, name: "", color: parseHexColor(color.value) },
    { kind: "agent" as const, name: "Claude", color: parseHexColor("#d97757") },
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

const { mutateAsync, isLoading: busy } = useRooms().create;
/** What did not go through, said above the button: why the Worker refused the trip, or that it failed */
type Failure = { kind: "refused"; reason: CreateRefusal } | { kind: "failed" };
const failed = shallowRef<Failure | null>(null);
/** What the person is told for each refusal */
const REFUSALS: Record<CreateRefusal, MessageId> = { "at the cap": "rooms.atCap" };
const say = (f: Failure) =>
  i18n.t(f.kind === "refused" ? REFUSALS[f.reason] : "rooms.createFailed");
async function create() {
  const room = filled.value;
  if (busy.value || room === null) return;
  failed.value = null;
  try {
    const made = await mutateAsync(room);
    if (made.ok) emit("created", made.value);
    else failed.value = { kind: "refused", reason: made.reason };
  } catch {
    failed.value = { kind: "failed" };
  }
}

const nameEl = useTemplateRef<{ focus(): void }>("nameEl");
onMounted(() => nameEl.value?.focus());
</script>

<template>
  <CtSheet as="form" @submit="create">
    <!-- no bar: the way back floats where a bar would be; the title opens the page -->
    <template #top>
      <CtBackButton @click="() => emit('close')">
        <Icon :size="16" :src="backIcon" />{{ i18n.t("home.trips") }}
      </CtBackButton>
    </template>

    <template #default>
      <div class="fields">
        <CtHeading level="sheet">{{ i18n.t("rooms.new") }}</CtHeading>
        <!-- the tag as it will hang on the trip; the fields below say the same to a screen reader -->
        <CtTag
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
            <span aria-live="polite">{{ dates.end === null ? i18n.t("rooms.pickLast") : "" }}</span>
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
    </template>

    <!-- the one action, always in reach under the fields -->
    <template #foot>
      <div class="act">
        <CtMessage v-if="failed !== null" role="alert">{{ say(failed) }}</CtMessage>
        <CtHint v-else-if="cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
        <CtButton
          size="lg"
          type="submit"
          variant="primary"
          :disabled="busy || filled === null || cut.offline"
        >
          {{ i18n.t(busy ? "rooms.creating" : "rooms.create") }}
        </CtButton>
      </div>
    </template>
  </CtSheet>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-9);
}

/* the tag rests on the desk above the fields, with room under it before the first one */
.preview {
  margin-block-end: var(--space-5);
}

.act {
  display: grid;
  gap: var(--space-4);
}
</style>
