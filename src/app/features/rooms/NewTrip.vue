<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onMounted, ref, useId, useTemplateRef } from "vue";

import { CtChip } from "../../../ui/index";

import type { HexColor } from "../../shared/color";

import { useI18n } from "../../i18n/useI18n";

import backIcon from "../../icons/back.svg";
import Icon from "../../icons/Icon.vue";
import minusIcon from "../../icons/minus.svg";
import plusIcon from "../../icons/plus.svg";

import { datesLabel, whenLabel } from "./label";
import { CURRENCIES, DEFAULT_CENTER, MAX_DAYS, MAX_NAME, MEMBER_COLORS, newRoom } from "./newRoom";
import TripTag from "./TripTag.vue";
import type { RoomId, RoomSummary } from "./types";
import { useCreateRoom } from "./useRooms";
import { whenOf } from "./when";

const emit = defineEmits<{ close: []; created: [room: RoomId] }>();

const i18n = useI18n();
const id = useId();
const today = Temporal.Now.plainDateISO();

const name = ref("");
const firstDay = ref(today.add({ days: 30 }).toString());
const count = ref(4);
const currency = ref<string>(CURRENCIES[0]);
const me = ref("");
const color = ref<string>(MEMBER_COLORS[0]);
const step = (by: number) => (count.value = Math.min(MAX_DAYS, Math.max(1, count.value + by)));

/** The form as a room the Worker will take, or null while it is not one yet */
const filled = computed(() =>
  newRoom(
    {
      name: name.value,
      firstDay: firstDay.value,
      days: count.value,
      currency: currency.value,
      me: me.value,
      color: color.value,
    },
    DEFAULT_CENTER,
  ),
);

/** The tag the trip will get, drawn as the form is filled in */
const first = computed(() => {
  try {
    return Temporal.PlainDate.from(firstDay.value);
  } catch {
    return null;
  }
});
const preview = computed(() => {
  const members: RoomSummary["members"] = [];
  if (me.value.trim() !== "")
    members.push({ kind: "person", name: me.value.trim(), color: color.value as HexColor });
  // every trip has the agent in it from the start (worker/room.ts)
  members.push({ kind: "agent", name: "Claude", color: "#d97757" as HexColor });
  return {
    name: name.value.trim() || i18n.t("rooms.namePlaceholder"),
    unnamed: name.value.trim() === "",
    dates: datesLabel(first.value, count.value, i18n.locale, i18n.t),
    when: whenLabel(whenOf({ first: first.value, days: count.value }, today), i18n.t),
    members,
  };
});

const { mutateAsync, isLoading: busy, error } = useCreateRoom();
async function create() {
  const room = filled.value;
  if (busy.value || room === null) return;
  try {
    emit("created", await mutateAsync(room));
  } catch {
    // the mutation's error state says so above the button; the person tries again
  }
}

const nameEl = useTemplateRef<HTMLInputElement>("nameEl");
onMounted(() => nameEl.value?.focus());
</script>

<template>
  <form class="sheet" @submit.prevent="create">
    <!-- no bar: the way back floats where a bar would be; the title opens the page -->
    <button class="back" type="button" @click="() => emit('close')">
      <Icon :size="16" :src="backIcon" />{{ i18n.t("home.trips") }}
    </button>

    <div class="body">
      <h2 class="title">{{ i18n.t("rooms.new") }}</h2>
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

      <div class="field">
        <label :for="`${id}-name`">{{ i18n.t("rooms.name") }}</label>
        <input
          :id="`${id}-name`"
          ref="nameEl"
          v-model="name"
          :maxlength="MAX_NAME"
          enterkeyhint="next"
          required
          :placeholder="i18n.t('rooms.namePlaceholder')"
        />
      </div>

      <div class="row">
        <div class="field">
          <label :for="`${id}-first`">{{ i18n.t("rooms.firstDay") }}</label>
          <input :id="`${id}-first`" v-model="firstDay" required type="date" />
        </div>
        <div class="field">
          <span :id="`${id}-days`">{{ i18n.t("rooms.days") }}</span>
          <div class="stepper" role="group" :aria-labelledby="`${id}-days`">
            <button
              type="button"
              :aria-label="i18n.t('rooms.fewer')"
              :disabled="count <= 1"
              @click="() => step(-1)"
            >
              <Icon :size="18" :src="minusIcon" />
            </button>
            <output aria-live="polite">{{ i18n.t("home.days", { count }) }}</output>
            <button
              type="button"
              :aria-label="i18n.t('rooms.more')"
              :disabled="count >= MAX_DAYS"
              @click="() => step(1)"
            >
              <Icon :size="18" :src="plusIcon" />
            </button>
          </div>
        </div>
      </div>

      <div class="field">
        <span :id="`${id}-currency`">{{ i18n.t("rooms.currency") }}</span>
        <div class="chips" role="group" :aria-labelledby="`${id}-currency`">
          <CtChip
            v-for="c in CURRENCIES"
            :key="c"
            toggle
            :selected="currency === c"
            @click="() => (currency = c)"
          >{{ c }}</CtChip>
        </div>
      </div>

      <div class="field">
        <label :for="`${id}-me`">{{ i18n.t("rooms.you") }}</label>
        <input :id="`${id}-me`" v-model="me" :maxlength="MAX_NAME" enterkeyhint="done" required />
      </div>

      <div class="field">
        <span :id="`${id}-color`">{{ i18n.t("rooms.color") }}</span>
        <div class="swatches" role="group" :aria-labelledby="`${id}-color`">
          <button
            v-for="(c, i) in MEMBER_COLORS"
            :key="c"
            type="button"
            :aria-pressed="color === c"
            :aria-label="`${i18n.t('rooms.color')} ${i + 1}`"
            :style="`--swatch: ${c}`"
            @click="() => (color = c)"
          ></button>
        </div>
      </div>
    </div>

    <footer>
      <p v-if="error !== null" role="alert">{{ i18n.t("rooms.createFailed") }}</p>
      <button class="primary" type="submit" :disabled="busy || filled === null">
        {{ i18n.t(busy ? "rooms.creating" : "rooms.create") }}
      </button>
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

  /* the way back, floating in the row where a bar would be */
  > .back {
    position: absolute;
    inset-inline-start: 12px;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + (var(--top-row) - var(--tap)) / 2);
    z-index: var(--z-chrome);
    min-height: var(--tap);
    padding: 0 12px 0 8px;
    border-radius: 999px;
    border: 0;
    background: var(--glass);
    backdrop-filter: blur(16px) saturate(1.5);
    -webkit-backdrop-filter: blur(16px) saturate(1.5);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--line) 80%, transparent),
      var(--shadow-tool);
    color: var(--muted);
    font-size: var(--font-sm);
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    @media (--can-hover) {
      &:hover {
        color: var(--ink);
      }
    }
  }
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--top-clear) var(--page-margin) 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.title {
  margin: 0;
  font-size: var(--font-4xl);
  font-weight: 700;
  line-height: 1.25;
}

/* the tag rests on the desk above the fields, with room under it before the first one */
.preview {
  margin-block-end: 10px;
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;

  /* a field's name, above it */
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
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;

    &::placeholder {
      color: var(--muted);
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}

/* first day, and how many: side by side */
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
}

.stepper {
  display: flex;
  align-items: center;
  min-height: 46px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);

  > button {
    display: grid;
    place-items: center;
    width: 46px;
    align-self: stretch;
    border: 0;
    background: transparent;
    color: var(--ink);
    border-radius: 10px;

    &:disabled {
      color: var(--muted);
      opacity: 0.4;
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
    }

    @media (--can-hover) {
      &:not(:disabled):hover {
        background: var(--wash);
      }
    }
  }

  > output {
    min-width: 5.5em;
    text-align: center;
    font-size: var(--font-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;

  /* the color itself, ringed in ink when it is the one */
  > button {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    border: 0;
    background: var(--swatch);
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 4px transparent;
    transition: box-shadow var(--duration-swap) var(--ease-morph);

    &[aria-pressed="true"] {
      box-shadow:
        0 0 0 3px var(--bg),
        0 0 0 5px var(--ink);
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 6px;
    }
  }
}

/* the one action, always in reach under the fields */
footer {
  flex-shrink: 0;
  display: grid;
  gap: 8px;
  padding: 12px var(--page-margin) calc(12px + env(safe-area-inset-bottom, 0px));
  border-block-start: 1px solid var(--line);
  background: var(--bg);

  > p {
    margin: 0;
    font-size: var(--font-sm);
    color: var(--ink);
  }
}

.primary {
  min-height: 48px;
  padding: 0 18px;
  font-size: var(--font-base);
  font-weight: 700;
  color: var(--on-ink);
  background: var(--ink);
  border: 0;
  border-radius: 999px;

  &:disabled {
    opacity: 0.35;
  }

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 3px;
  }

  @media (--can-hover) {
    &:not(:disabled):hover {
      box-shadow: var(--shadow-float);
    }
  }
}
</style>
