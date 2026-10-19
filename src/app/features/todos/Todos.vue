<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref, useId } from "vue";

import { CtAvatar, CtButton, CtInput } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { useMembers } from "../members/useMembers";
import type { NoteId } from "../notes/id";
import type { Memo } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { shortDate } from "../trip/format";

import { isLate, todosOf, type Todo } from "./list";

/**
 * What there is to do before the trip, on its home: the to-dos and the plans still to book, the
 * soonest first. A to-do is ticked off here; a plan is marked booked. A new to-do is written in
 * a line (`add`, which puts it on the desk); a title opens its note (`open`).
 */
const emit = defineEmits<{ add: [title: string]; open: [id: NoteId] }>();
const store = useNotes();
const { members } = useMembers();
const i18n = useI18n();
const id = useId();
const today = Temporal.Now.plainDateISO();

const todos = computed(() => todosOf(store.notes.value ?? []));
const open = computed(() => todos.value.filter((t) => !t.done).length);

const title = ref("");
function add() {
  const t = title.value.trim();
  if (t === "") return;
  emit("add", t);
  title.value = "";
}

/** Who is to do it, while they are in the room */
const whoOf = (t: Todo) => members.value?.find((m) => m.id === t.memo.assignee);
/** "By 10/20", or "" with no day */
function dueText(t: Todo) {
  if (t.due === null) return "";
  return i18n.t(isLate(t, today) ? "todo.late" : "todo.due", {
    date: shortDate(t.due, i18n.locale),
  });
}
function setDone(n: Memo, e: Event) {
  if (e.target instanceof HTMLInputElement) store.update(n.id, { checked: e.target.checked });
}
/** Booked: its number and page can be written in the note later */
function markBooked(n: Memo) {
  store.update(n.id, { booking: { state: "booked", code: "", url: null } });
}
</script>

<template>
  <article class="todos" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`">{{ i18n.t("todo.title") }}<small v-if="open > 0">{{ open }}</small></h2>
    <form @submit.prevent="add">
      <CtInput
        v-model="title"
        enterkeyhint="done"
        maxlength="200"
        :aria-label="i18n.t('todo.new')"
        :placeholder="i18n.t('todo.placeholder')"
      />
      <CtButton size="lg" type="submit" variant="primary" :disabled="title.trim() === ''">{{
        i18n.t("todo.add")
      }}</CtButton>
    </form>
    <p v-if="todos.length === 0">{{ i18n.t("todo.empty") }}</p>
    <ul v-else>
      <li
        v-for="t in todos"
        :key="t.memo.id"
        :data-done="t.done || undefined"
        :data-late="isLate(t, today) || undefined"
      >
        <input
          v-if="t.kind === 'task'"
          type="checkbox"
          :aria-label="t.memo.title"
          :checked="t.done"
          @change="(e) => setDone(t.memo, e)"
        />
        <span v-else class="badge">{{ i18n.t("todo.booking") }}</span>
        <button class="title" type="button" @click="() => emit('open', t.memo.id)">{{
          t.memo.title
        }}</button>
        <small v-if="dueText(t) !== ''">{{ dueText(t) }}</small>
        <span v-if="whoOf(t) !== undefined" class="who"><CtAvatar
            :color="whoOf(t)?.color"
            size="dot"
          />{{
            whoOf(t)?.name
          }}</span>
        <CtButton
          v-if="t.kind === 'booking'"
          class="booked"
          variant="text"
          @click="() => markBooked(t.memo)"
        >{{ i18n.t("shiori.markBooked") }}</CtButton>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.todos {
  display: flex;
  flex-direction: column;
  gap: 10px;

  /* a heading like the people's under it */
  > h2 {
    margin: 0;
    font-size: var(--font-2xl);
    line-height: 1.35;
    display: flex;
    align-items: center;
    gap: 8px;

    > small {
      min-width: 22px;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--ink);
      color: var(--bg);
      font-size: var(--font-xs);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  }

  /* a line to write the next one in, as quick as a note */
  > form {
    display: flex;
    gap: 8px;

    > input {
      flex: 1;
    }
  }

  > p {
    margin: 0;
    color: var(--muted);
    font-size: var(--font-sm);
  }

  > ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;

    > li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: 10px;
      min-height: var(--tap);
      border-block-end: 1px solid var(--line);

      > input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: var(--ink);
      }

      /* a plan still to book, in place of the box: it is done by booking it */
      > .badge {
        padding: 1px 6px;
        border: 1px dashed color-mix(in oklch, var(--ink) 45%, transparent);
        border-radius: 6px;
        font-size: var(--font-2xs);
        font-weight: 700;
        color: var(--muted);
      }

      > .title {
        flex: 1;
        min-width: 0;
        min-height: var(--tap);
        padding: 0;
        border: 0;
        background: none;
        color: var(--ink);
        font: inherit;
        font-size: var(--font-base);
        text-align: start;
        overflow-wrap: anywhere;
      }

      > small {
        color: var(--muted);
        font-size: var(--font-xs);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* who is to do it: a dot of their color and their name */
      > .who {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--font-xs);
        color: var(--muted);
      }

      /* the way it is done, small as the line's other notes */
      > .booked {
        font-size: var(--font-xs);
      }

      &[data-done] > .title {
        color: var(--muted);
        text-decoration: line-through;
      }

      &[data-late] > small {
        color: var(--danger);
      }
    }
  }
}
</style>
