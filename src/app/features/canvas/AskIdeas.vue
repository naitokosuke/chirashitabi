<script lang="ts">
import { shallowRef } from "vue";

import { defineQuery } from "@pinia/colada";

import type { RoomId } from "../rooms/types";
import type { Here } from "../sync/here";
import type { WorkerApi } from "../worker/types";

/**
 * The asks for ideas on their way, one at a time in each room, in the room it is asked in:
 * the desk of another room opened meanwhile offers its own. A paid call
 * (docs/auth-and-security.md), so never retried: trying again is a tap. Defined once for the
 * app (defineQuery), so an ask outlives the desk it was made from.
 */
const useAsking = defineQuery(() => {
  /** The rooms an ask is on its way in */
  const asking = shallowRef<ReadonlySet<RoomId>>(new Set());
  const thinkingIn = (room: RoomId) => asking.value.has(room);
  function mark(room: RoomId, on: boolean) {
    const next = new Set(asking.value);
    if (on) next.add(room);
    else next.delete(room);
    asking.value = next;
  }
  /** Asks the agent of `room`; its answer, or what it threw */
  async function ask({ room, api }: Here, request: Parameters<WorkerApi["suggest"]>[0]) {
    mark(room, true);
    try {
      return await api.suggest(request);
    } finally {
      mark(room, false);
    }
  }
  return { thinkingIn, ask };
});
</script>

<script setup lang="ts" vapor>
import { computed, nextTick, ref, useId, useTemplateRef, watch } from "vue";

import { CtButton, CtInput, CtPanel } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import type { NoteId } from "../notes/id";
import { noteLabel } from "../notes/label";
import type { Note } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";
import { useToast } from "../toast/useToast";

import type { Pt } from "./transform";

/**
 * Asking the room's agent for ideas: the button, in the row it is put in, and the ask that
 * unfolds under it, a line of words, blank for anything, from a note or for the whole trip.
 * `at` is where the ideas go on the desk, in its own coordinates, for the note they are asked
 * from (or none, for the whole trip): the desk knows where its cards are drawn. The desk opens
 * it from a note (`open`), and asks whether an ask is on its way (`busy`) to offer that or not.
 */
const props = defineProps<{ at: (about: Note | null) => Pt }>();
const { notes } = useNotes();
const toast = useToast();
const here = useInRoom();
const i18n = useI18n();
/** Cut off: the agent is not offered */
const cut = useOffline();

const { thinkingIn, ask } = useAsking();
/** An ask on its way in this room: another room's is none here */
const thinking = computed(() => thinkingIn(here.room));
/**
 * The ask while it is open under its button: the note it starts from (picked from a card's
 * menu), or none for the whole trip. The words being written are kept apart, so a failed ask
 * keeps them for the next try.
 */
const asking = shallowRef<{ kind: "closed" } | { kind: "trip" } | { kind: "note"; about: NoteId }>({
  kind: "closed",
});
/** The note the ask starts from as it is now; none for the whole trip, or once it went */
const askAbout = computed(() => {
  const a = asking.value;
  return a.kind !== "note" ? null : (notes.value?.find((n) => n.id === a.about) ?? null);
});
// a note deleted by the partner, or in another room, takes the ask from it with it; the words stay
watch(
  () => asking.value.kind === "note" && askAbout.value === null,
  (gone) => {
    if (gone) close();
  },
);
const askWords = ref("");
const askInput = useTemplateRef<{ focus(): void }>("askInput");
const openButton = useTemplateRef<{ focus(): void }>("openButton");
const askId = useId();
function open(about: Note | null) {
  asking.value = about === null ? { kind: "trip" } : { kind: "note", about: about.id };
  void nextTick(() => askInput.value?.focus());
}
/** The ask folds back into its button; the keyboard, when it was in the ask, goes back there too */
function close() {
  if (import.meta.env.SSR) return;
  const hadFocus = document.getElementById(askId)?.contains(document.activeElement) ?? false;
  asking.value = { kind: "closed" };
  if (hadFocus) openButton.value?.focus();
}
function toggle() {
  if (asking.value.kind === "closed") open(null);
  else close();
}
/** Esc folds the ask, and is taken: what covers the desk (a sheet) leaves an Esc taken alone */
function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  close();
}
/**
 * The room's agent leaves a few ideas where the person is looking, or in a column beside the
 * note they asked from. They arrive as the room's changes, like the partner's cards; the toast
 * says how many, or why none came, in the room it was asked in only: answered once another
 * room is open, it says nothing there. What is written for the next ask meanwhile stays: only
 * the words this ask sent are cleared, once it is answered. Cut off, nothing is asked: the ask
 * stays open with its words, for when the connection is back.
 */
async function askForIdeas() {
  const a = asking.value;
  // where the note is now, and only while it is there
  const about = askAbout.value;
  if (cut.offline || thinking.value || a.kind === "closed" || (a.kind === "note" && about === null))
    return;
  const at = props.at(about);
  const sent = askWords.value;
  const { room } = here;
  close();
  try {
    const answer = await ask(here, { at, ask: sent, about: about?.id ?? null });
    if (!answer.ok) {
      const limit =
        answer.reason.ceiling === "trip" ? "canvas.ideasTripLimit" : "canvas.ideasLimit";
      toast.show(i18n.t(limit), { room });
      return;
    }
    const n = answer.value;
    if (askWords.value === sent) askWords.value = "";
    toast.show(n === 0 ? i18n.t("canvas.noIdeas") : i18n.t("canvas.ideasAdded", { count: n }), {
      room,
    });
  } catch {
    toast.show(i18n.t("canvas.ideasFailed"), { room });
  }
}

defineExpose({ open, busy: () => thinking.value });
</script>

<template>
  <!--
    while an ask is on its way it keeps the keyboard (the ask sent from it hands it back), and
    a press on it does nothing (soft-disabled)
  -->
  <CtButton
    ref="openButton"
    class="open"
    float
    variant="ask"
    :disabled="cut.offline"
    :soft-disabled="thinking"
    :busy="thinking"
    :aria-expanded="asking.kind !== 'closed'"
    :aria-controls="askId"
    @click="toggle"
  >{{ i18n.t(thinking ? "canvas.thinking" : "canvas.askIdeas") }}</CtButton>

  <!--
    what to ask the agent for: a line of words, blank for anything, from a note or not; it
    unfolds down from its button and folds back up into it
  -->
  <Transition name="ask">
    <CtPanel
      v-if="asking.kind !== 'closed'"
      :id="askId"
      as="form"
      class="asking"
      float
      :aria-label="i18n.t('canvas.askIdeas')"
      @submit="askForIdeas"
    >
      <p v-if="askAbout !== null">{{
        i18n.t("canvas.askFrom", { title: noteLabel(askAbout, i18n.t) })
      }}</p>
      <CtInput
        ref="askInput"
        v-model="askWords"
        enterkeyhint="send"
        maxlength="100"
        :aria-label="i18n.t('canvas.askWords')"
        :placeholder="i18n.t('canvas.askWords')"
        @keydown="onKey"
      />
      <!-- cut off while open, the ask is off but keeps the keyboard (soft-disabled) -->
      <div>
        <CtButton @click="close">{{ i18n.t("common.close") }}</CtButton>
        <CtButton type="submit" variant="primary" :soft-disabled="cut.offline">{{
          i18n.t("canvas.ask")
        }}</CtButton>
      </div>
    </CtPanel>
  </Transition>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

/*
 * Both sit in the row along the top of the desk, which takes no touches itself so the desk
 * between its controls still pans; these take them
 */

/* the button (floating, as the tools are) keeps its width beside the tags */
.open {
  flex-shrink: 0;
  pointer-events: auto;
}

/*
 * The ask, open under its button: a panel with a line of words and the ask. The row spans the
 * desk from its top, so the panel is placed as on the desk itself.
 */
.asking {
  position: absolute;
  inset-inline-end: var(--space-6);
  inset-block-start: var(--top-clear);
  z-index: var(--z-menu);
  width: min(360px, calc(100% - var(--space-12)));
  display: grid;
  gap: var(--space-5);
  pointer-events: auto;
  /* it grows out of its button, at the row's end above it */
  transform-origin: 100% 0;

  /* opening: the panel unfolds, then what is in it settles a beat later */
  &.ask-enter-active {
    transition:
      opacity var(--duration-swap) ease,
      transform var(--duration-morph) var(--ease-morph);

    > * {
      transition:
        opacity var(--duration-swap) ease 60ms,
        transform var(--duration-morph) var(--ease-morph) 60ms;

      @media (--reduced-motion) {
        transition: none;
      }
    }
  }
  &.ask-enter-from {
    opacity: 0;
    transform: translateY(-10px) scale(0.92);

    > * {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  /* closing: quicker, folding back up into the button */
  &.ask-leave-active {
    transition:
      opacity calc(var(--duration-swap) * 0.6) ease-in,
      transform calc(var(--duration-swap) * 0.6) ease-in;
  }
  &.ask-leave-to {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }

  /* the note it starts from, on one line */
  > p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: var(--font-sm);
    font-weight: 700;
  }

  > div {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
}
</style>
