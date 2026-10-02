<script lang="ts">
import { Temporal } from "temporal-polyfill-lite";

/** What the room is created with; the Worker checks it again */
export interface NewRoom {
  trip: { name: string; days: string[]; currency: string; center: { lat: number; lng: number } };
  me: { name: string; color: string };
}

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

import { useRoom } from "../features/sync/useRoom";

const emit = defineEmits<{ enter: [roomId: string] }>();
const i18n = useI18n();
const room = useRoom();
const id = useId();

type Listed = { id: string; name: string };
const rooms = ref<Listed[] | null>(null);
const listFailed = ref(false);
const creating = ref(false);
const busy = ref(false);

const name = ref("");
const firstDay = ref(Temporal.Now.plainDateISO().add({ days: 30 }).toString());
const count = ref(4);
const currency = ref<string>(CURRENCIES[0]);
const me = ref("");
const color = ref<string>(MEMBER_COLORS[0]);

const headers = { "Content-Type": "application/json" };

async function list() {
  listFailed.value = false;
  try {
    const res = await fetch("/api/me", { method: "POST", headers, body: "{}" });
    if (!res.ok) throw new Error(String(res.status));
    rooms.value = ((await res.json()) as { rooms: Listed[] }).rooms;
  } catch {
    listFailed.value = true;
    rooms.value = [];
  }
}

async function create() {
  if (busy.value) return;
  busy.value = true;
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
    const res = await fetch("/api/rooms", { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(String(res.status));
    emit("enter", ((await res.json()) as { roomId: string }).roomId);
  } catch {
    listFailed.value = true;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  // the room this device was in last opens by itself; the list is for choosing another
  const last = room.remembered();
  if (last !== null && room.status === "idle") emit("enter", last);
  void list();
});
</script>

<template>
  <div class="rooms">
    <div class="head">
      <h1>chirashitabi</h1>
      <p v-if="room.status === 'connecting'" class="state">{{ i18n.t("rooms.connecting") }}</p>
      <p v-else-if="room.status === 'failed' || listFailed" class="state">
        {{ i18n.t("rooms.failed") }}
        <button
          type="button"
          @click="() => {
            room.reconnect();
            list();
          }"
        >{{ i18n.t("rooms.retry") }}</button>
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
        <button class="primary" type="submit" :disabled="busy || !name.trim() || !me.trim()">{{ i18n.t("rooms.create") }}</button>
      </div>
    </form>

    <section v-else>
      <h2>{{ i18n.t("rooms.yours") }}</h2>
      <p v-if="rooms !== null && rooms.length === 0" class="empty">{{ i18n.t("rooms.none") }}</p>
      <ul v-else-if="rooms !== null">
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

  & h1 {
    margin: 0;
    font-size: var(--font-3xl);
    font-weight: 900;
  }

  & h2 {
    margin: 24px 0 8px;
    font-size: var(--font-xl);
    font-weight: 700;
  }
}

.state {
  color: var(--stone);
}

.empty {
  color: var(--stone);
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
}

form {
  display: grid;
  gap: 6px;

  & label, & .l {
    margin-top: 10px;
    font-size: var(--font-sm);
    color: var(--stone);
  }

  & input, & select {
    padding: 10px 12px;
    font: inherit;
    background: var(--surface);
    border: 1.5px solid var(--line);
    border-radius: 10px;
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

  & button {
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
  color: var(--surface);
  background: var(--ink);
  border: 0;
  border-radius: 999px;

  &:disabled {
    opacity: 0.4;
  }
}
</style>
