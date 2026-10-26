<script setup lang="ts" vapor>
import type { Temporal } from "temporal-polyfill-lite";

import { computed, ref, useId } from "vue";

import {
  CtByline,
  CtBadge,
  CtButton,
  CtCheckbox,
  CtHeading,
  CtHint,
  CtInput,
  CtPress,
} from "../../../ui/index";

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
 * a line (`add`, which puts it on the desk); a title opens its note (`open`). What is late is
 * counted from `today`.
 */
const props = defineProps<{ today: Temporal.PlainDate }>();
const emit = defineEmits<{ add: [title: string]; open: [id: NoteId] }>();
const store = useNotes();
const { members } = useMembers();
const i18n = useI18n();
const id = useId();

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
  return i18n.t(isLate(t, props.today) ? "todo.late" : "todo.due", {
    date: shortDate(t.due, i18n.locale),
  });
}
function setDone(n: Memo, checked: boolean) {
  store.update(n.id, { checked });
}
/** Booked: its number and page can be written in the note later */
function markBooked(n: Memo) {
  store.update(n.id, { booking: { state: "booked", code: "", url: null } });
}
</script>

<template>
  <article class="todos" :aria-labelledby="`${id}-title`">
    <CtHeading :id="`${id}-title`">{{ i18n.t("todo.title") }}<CtBadge v-if="open > 0" filled>{{
        open
      }}</CtBadge></CtHeading>
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
    <CtHint v-if="todos.length === 0" size="sm">{{ i18n.t("todo.empty") }}</CtHint>
    <ul v-else>
      <li v-for="t in todos" :key="t.memo.id">
        <CtCheckbox
          v-if="t.kind === 'task'"
          :aria-label="t.memo.title"
          :model-value="t.done"
          @update:model-value="(checked) => setDone(t.memo, checked)"
        />
        <CtBadge v-else dashed>{{ i18n.t("todo.booking") }}</CtBadge>
        <CtPress class="title" @click="() => emit('open', t.memo.id)">{{
          t.memo.title
        }}</CtPress>
        <CtHint v-if="dueText(t) !== ''" :danger="isLate(t, today)" strong>{{ dueText(t) }}</CtHint>
        <CtByline v-if="whoOf(t) !== undefined" :color="whoOf(t)?.color" size="xs">{{
          whoOf(t)?.name
        }}</CtByline>
        <CtButton
          v-if="t.kind === 'booking'"
          size="sm"
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

  /* the heading, and how many are still to do beside it */
  > h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* a line to write the next one in, as quick as a note */
  > form {
    display: flex;
    gap: 8px;

    > input {
      flex: 1;
    }
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
      font-size: var(--font-base);

      /* a plan still to book, in place of the box: it is done by booking it */
      > .title {
        flex: 1;
        min-width: 0;
      }

      &:has(> input:checked) > .title {
        color: var(--muted);
        text-decoration: line-through;
      }
    }
  }
}
</style>
