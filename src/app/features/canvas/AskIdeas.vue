<script setup lang="ts" vapor>
import { computed, nextTick, ref, shallowRef, useId, useTemplateRef, watch } from "vue";

import { useMutation } from "@pinia/colada";

import { CtButton, CtInput, CtPanel } from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import type { NoteId } from "../notes/id";
import type { Note } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";
import { useToast } from "../toast/useToast";
import type { WorkerApi } from "../worker/types";

import type { Pt } from "./transform";

/**
 * Asking the room's agent for ideas: the button, in the row it is put in, and the ask that
 * unfolds under it, a line of words, blank for anything, from a note or for the whole trip.
 * `middle` is where the person is looking on the desk, in the desk's own coordinates; the
 * ideas for the whole trip go there. The desk opens it from a note (`open`), and asks whether
 * an ask is on its way (`busy`) to offer that or not.
 */
const props = defineProps<{ middle: () => Pt }>();
const { notes } = useNotes();
const toast = useToast();
const here = useInRoom();
const i18n = useI18n();
/** Cut off: the agent is not offered */
const cut = useOffline();

/**
 * Asking the room's agent for ideas, as a mutation for its pending state. A paid call
 * (docs/auth-and-security.md), so never retried by the library: trying again is a tap.
 */
const { mutateAsync: suggestAt, isLoading: thinking } = useMutation({
  mutation: (request: Parameters<WorkerApi["suggest"]>[0]) => here.api.suggest(request),
});
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
    if (gone) asking.value = { kind: "closed" };
  },
);
const askWords = ref("");
const askInput = useTemplateRef<{ focus(): void }>("askInput");
const askId = useId();
function open(about: Note | null) {
  asking.value = about === null ? { kind: "trip" } : { kind: "note", about: about.id };
  void nextTick(() => askInput.value?.focus());
}
function toggle() {
  if (asking.value.kind === "closed") open(null);
  else asking.value = { kind: "closed" };
}
function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  asking.value = { kind: "closed" };
}
function onSubmit(e: Event) {
  e.preventDefault();
  void askForIdeas();
}
/**
 * The room's agent leaves a few ideas where the person is looking, or in a column beside the
 * note they asked from. They arrive as the room's changes, like the partner's cards; the toast
 * says how many, or why none came. What is written for the next ask meanwhile stays: only the
 * words this ask sent are cleared, once it is answered.
 */
async function askForIdeas() {
  const a = asking.value;
  // where the note is now, and only while it is there
  const about = askAbout.value;
  if (thinking.value || a.kind === "closed" || (a.kind === "note" && about === null)) return;
  // the column's middle: a card's width (164px) and a gap past the note's right edge
  const at =
    about === null ? props.middle() : { x: about.x + 164 * about.scale + 24 + 94, y: about.y + 40 };
  const sent = askWords.value;
  asking.value = { kind: "closed" };
  try {
    const answer = await suggestAt({ at, ask: sent, about: about?.id ?? null });
    if (!answer.ok) {
      const limit =
        answer.reason.ceiling === "trip" ? "canvas.ideasTripLimit" : "canvas.ideasLimit";
      toast.show(i18n.t(limit));
      return;
    }
    const n = answer.value;
    if (askWords.value === sent) askWords.value = "";
    toast.show(n === 0 ? i18n.t("canvas.noIdeas") : i18n.t("canvas.ideasAdded", { count: n }));
  } catch {
    toast.show(i18n.t("canvas.ideasFailed"));
  }
}

defineExpose({ open, busy: () => thinking.value });
</script>

<template>
  <CtButton
    class="open"
    float
    variant="ask"
    :disabled="thinking || cut.offline"
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
      @submit="onSubmit"
    >
      <p v-if="askAbout !== null">{{ i18n.t("canvas.askFrom", { title: askAbout.title }) }}</p>
      <CtInput
        ref="askInput"
        v-model="askWords"
        enterkeyhint="send"
        maxlength="100"
        :aria-label="i18n.t('canvas.askWords')"
        :placeholder="i18n.t('canvas.askWords')"
        @keydown="onKey"
      />
      <div>
        <CtButton @click="toggle">{{ i18n.t("common.close") }}</CtButton>
        <CtButton type="submit" variant="primary">{{ i18n.t("canvas.ask") }}</CtButton>
      </div>
    </CtPanel>
  </Transition>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

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
  inset-inline-end: 12px;
  inset-block-start: var(--top-clear);
  z-index: var(--z-menu);
  width: min(360px, calc(100% - 24px));
  display: grid;
  gap: 10px;
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
    gap: 6px;
  }
}
</style>
