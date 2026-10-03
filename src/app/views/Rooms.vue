<script lang="ts">
import { Temporal } from "temporal-polyfill-lite";

/** `count` days from `first`, as the ISO dates the room stores */
export const daysFrom = (first: Temporal.PlainDate, count: number): string[] =>
  Array.from({ length: count }, (_, i) => first.add({ days: i }).toString());

export const CURRENCIES = ["TWD", "JPY", "USD", "EUR", "KRW", "THB"] as const;
export const MEMBER_COLORS = [
  "#3c6ee0",
  "#d7263d",
  "#1b998b",
  "#f4a261",
  "#7b2cbf",
  "#2a9d8f",
] as const;
/** Where the map opens for a new trip; the trip's places move it once there are pins */
export const DEFAULT_CENTER = { lat: 25.05, lng: 121.54 };
</script>

<script setup lang="ts" vapor>
import { onMounted, ref, useId } from "vue";

import { useI18n } from "../i18n/useI18n";

import type { NewRoom } from "../features/rooms/types";
import { useCreateRoom, useRoomList } from "../features/rooms/useRooms";
import { useRoom } from "../features/sync/useRoom";

const emit = defineEmits<{ enter: [roomId: string] }>();
const i18n = useI18n();
const room = useRoom();
const id = useId();

const { data: rooms, status: listStatus, refetch: refetchList } = useRoomList();
const { mutateAsync: createAsync, isLoading: busy, error: createError } = useCreateRoom();
const creating = ref(false);

const name = ref("");
const firstDay = ref(Temporal.Now.plainDateISO().add({ days: 30 }).toString());
const count = ref(4);
const currency = ref<string>(CURRENCIES[0]);
const me = ref("");
const color = ref<string>(MEMBER_COLORS[0]);

async function create() {
  if (busy.value) return;
  const body: NewRoom = {
    trip: {
      name: name.value.trim(),
      days: daysFrom(Temporal.PlainDate.from(firstDay.value), count.value),
      currency: currency.value,
      center: DEFAULT_CENTER,
    },
    me: { name: me.value.trim(), color: color.value },
  };
  try {
    emit("enter", await createAsync(body));
  } catch {
    // the mutation's error state says so under the form; the person tries again
  }
}
function retry() {
  room.reconnect();
  void refetchList();
}

onMounted(() => {
  // the room this device was in last opens by itself; the list is for choosing another
  const last = room.remembered();
  if (last !== null && room.status === "idle") emit("enter", last);
});
</script>

<template>
  <div class="rooms">
    <div class="head">
      <h1>chirashitabi</h1>
      <p v-if="room.status === 'connecting'" class="state">{{ i18n.t("rooms.connecting") }}</p>
      <p v-else-if="room.status === 'failed' || listStatus === 'error'" class="state">
        {{ i18n.t("rooms.failed") }}
        <button type="button" @click="retry">{{ i18n.t("rooms.retry") }}</button>
      </p>
    </div>

    <form v-if="creating" @submit.prevent="create">
      <h2>{{ i18n.t("rooms.new") }}</h2>
      <label :for="`${id}-name`">{{ i18n.t("rooms.name") }}</label>
      <input
        :id="`${id}-name`"
        v-model="name"
        maxlength="60"
        required
        :placeholder="i18n.t('rooms.namePlaceholder')"
      />
      <div class="row">
        <div>
          <label :for="`${id}-first`">{{ i18n.t("rooms.firstDay") }}</label>
          <input :id="`${id}-first`" v-model="firstDay" required type="date" />
        </div>
        <div>
          <label :for="`${id}-count`">{{ i18n.t("rooms.days") }}</label>
          <input :id="`${id}-count`" v-model.number="count" max="60" min="1" required type="number" />
        </div>
        <div>
          <label :for="`${id}-currency`">{{ i18n.t("rooms.currency") }}</label>
          <select :id="`${id}-currency`" v-model="currency">
            <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
      <label :for="`${id}-me`">{{ i18n.t("rooms.you") }}</label>
      <input :id="`${id}-me`" v-model="me" maxlength="60" required />
      <span :id="`${id}-color`" class="l">{{ i18n.t("rooms.color") }}</span>
      <div class="colors" role="group" :aria-labelledby="`${id}-color`">
        <button
          v-for="c in MEMBER_COLORS"
          :key="c"
          type="button"
          :class="{ on: color === c }"
          :style="`background:${c}`"
          :aria-label="c"
          @click="() => (color = c)"
        ></button>
      </div>
      <div class="actions">
        <button type="button" @click="() => (creating = false)">{{ i18n.t("common.close") }}</button>
        <button class="primary" type="submit" :disabled="busy || !name.trim() || !me.trim()">{{ i18n.t(busy ? "rooms.creating" : "rooms.create") }}</button>
      </div>
      <p v-if="createError !== null" aria-live="polite" class="state">{{ i18n.t("rooms.createFailed") }}</p>
    </form>

    <section v-else>
      <h2>{{ i18n.t("rooms.yours") }}</h2>
      <p v-if="listStatus === 'pending'" aria-live="polite" class="empty">{{ i18n.t("rooms.loading") }}</p>
      <!-- "none" only when the list says so; a list that failed says nothing about what exists -->
      <p v-else-if="listStatus === 'success' && (rooms ?? []).length === 0" class="empty">{{ i18n.t("rooms.none") }}</p>
      <ul v-else>
        <li v-for="r in rooms" :key="r.id">
          <button class="open" type="button" @click="() => emit('enter', r.id)">{{ r.name }}</button>
        </li>
      </ul>
      <button class="primary" type="button" @click="() => (creating = true)">{{ i18n.t("rooms.new") }}</button>
    </section>
  </div>
</template>

<style scoped>
.rooms {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 20px 40px;
  background: var(--bg);
  h1 {
    margin: 0;
    font-size: var(--font-3xl);
    font-weight: 700;
  }
  h2 {
    margin: 24px 0 8px;
    font-size: var(--font-xl);
    font-weight: 700;
  }
}

.state {
  color: var(--muted);
}

.empty {
  color: var(--muted);
}

ul {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  gap: 8px;
}

.open {
  width: 100%;
  text-align: start;
  padding: 14px 16px;
  font-size: var(--font-lg);
  font-weight: 700;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow-tool);
}

form {
  display: grid;
  gap: 6px;
  label, .l {
    margin-top: 10px;
    font-size: var(--font-sm);
    color: var(--muted);
  }
  & input, & select {
    padding: 10px 12px;
    font: inherit;
    background: var(--surface);
    border: 1.5px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow-tool);
  }
}

.row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  & > div {
    display: grid;
    gap: 6px;
  }
}

.colors {
  display: flex;
  gap: 10px;
  button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid transparent;
    &.on {
      border-color: var(--ink);
    }
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.primary {
  padding: 12px 18px;
  font-weight: 700;
  color: var(--on-ink);
  background: var(--ink);
  border: 0;
  border-radius: 999px;
  &:disabled {
    opacity: 0.4;
  }
  @media (hover: hover) {
    &:not(:disabled):hover {
      box-shadow: var(--shadow-float);
    }
  }
}
</style>
