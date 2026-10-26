<script lang="ts">
import { shallowRef } from "vue";

import { defineQuery, useQueryCache } from "@pinia/colada";

import type { Locale } from "../../i18n/locale";

import type { RoomId } from "../rooms/types";
import type { Here } from "../sync/InRoom.vue";
import { roomKeys } from "../sync/keys";
import type { OverBudget } from "../worker/types";

/**
 * Putting a room's booklet up or taking it down: nothing under way, one under way, or why it
 * failed
 */
type Publishing =
  | { kind: "idle" }
  | { kind: "asking"; to: "publish" | "withdraw" }
  | { kind: "failed"; why: "failed" | OverBudget["ceiling"] };

/**
 * The owner's one change at a time in each room to the booklet as a public page
 * (docs/auth-and-security.md): putting it up (at a new link each time) or taking it down, in
 * the room it is asked in. Each answer, and how the change went, is that room's (keys.ts),
 * whichever room is open when it comes. Publishing is a budgeted call, never retried: a
 * failure, thrown or the budget's refusal, is said under the buttons, and trying again is the
 * owner's tap. Kept while the appendix is not open. Defined once for the app (defineQuery).
 */
const usePublishing = defineQuery(() => {
  const queryCache = useQueryCache();
  /** Each room's change under way or failed */
  const changes = shallowRef<ReadonlyMap<RoomId, Publishing>>(new Map());

  /** How the last change in `room` went; nothing under way when none was asked there */
  const publishingIn = (room: RoomId): Publishing => changes.value.get(room) ?? { kind: "idle" };
  function keep(room: RoomId, state: Publishing) {
    changes.value = new Map(changes.value).set(room, state);
  }

  /** Puts it up in `lang`, at a new link */
  async function putUp({ room, api }: Here, lang: Locale) {
    if (publishingIn(room).kind === "asking") return;
    keep(room, { kind: "asking", to: "publish" });
    try {
      const answer = await api.publish(lang);
      if (answer.ok) queryCache.setQueryData(roomKeys.publication(room), answer.value);
      keep(room, answer.ok ? { kind: "idle" } : { kind: "failed", why: answer.reason.ceiling });
    } catch {
      keep(room, { kind: "failed", why: "failed" });
    }
  }
  async function takeDown({ room, api }: Here) {
    if (publishingIn(room).kind === "asking") return;
    keep(room, { kind: "asking", to: "withdraw" });
    try {
      await api.withdraw();
      queryCache.setQueryData(roomKeys.publication(room), null);
      keep(room, { kind: "idle" });
    } catch {
      keep(room, { kind: "failed", why: "failed" });
    }
  }

  return { publishingIn, putUp, takeDown };
});
</script>

<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref, useId } from "vue";

import { useQuery } from "@pinia/colada";

import {
  CtButton,
  CtCheck,
  CtHeading,
  CtHint,
  CtLink,
  CtMessage,
  CtPanel,
  CtPaper,
} from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import { paperOf } from "../members/paper";
import { useMembers } from "../members/useMembers";
import { ARRIVAL_TAG, PACKING_TAG, type Memo } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useInRoom } from "../sync/InRoom.vue";
import { useOffline } from "../sync/useOffline";
import { calendarOf } from "../trip/calendar";
import { useTrip } from "../trip/useTrip";

/**
 * The booklet's appendix: what to pack and what to do on arrival, ticked off on the notes' own
 * paper; the plan out to a calendar; and the booklet as a page anyone with its link can read,
 * put up and taken down by the owner.
 */
const store = useNotes();
const { byTag } = useTrip();
const { members, me } = useMembers();
const here = useInRoom();
const i18n = useI18n();
/** What the checklists' boxes are named by, so a label can point at its box */
const id = useId();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const { publishingIn, putUp, takeDown } = usePublishing();
/** The change to this room's public page: another room's under way or failed is none here */
const publishing = computed(() => publishingIn(here.room));
/** A note's paper: whoever wrote it */
const paperFor = (n: Memo) => paperOf(members.value?.find((m) => m.id === n.by)?.color);

const TAGS = [PACKING_TAG, ARRIVAL_TAG];

/** A tick in the appendix: shared with the room, so the partner sees the bag is packed */
function setChecked(n: Memo, checked: boolean) {
  store.update(n.id, { checked });
}
/** The confirmed plan, the flights and the stays as an .ics file, saved by the browser */
// A file handed over and a link copied: what a tap does in a browser, never while rendering on a server
function downloadCalendar() {
  if (import.meta.env.SSR) return;
  const t = here.trip;
  const ics = calendarOf(t, store.notes.value ?? [], here.room, Temporal.Now.instant(), {
    flight: (number, from, to) => (number === "" ? `${from} → ${to}` : `${number} ${from} → ${to}`),
    // the labels from the messages, the names as they are: a calendar keeps no isolating marks
    stay: (name) => `${i18n.t("shiori.calendarStay")} ${name}`,
    booked: (code) => `${i18n.t("shiori.booked")} ${code}`,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  // a name a file system takes: the trip's, without the characters some refuse
  const name = t.name.replace(/[\\/:*?"<>|]+/g, " ").trim();
  a.download = `${name === "" ? "trip" : name}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- the booklet as a public page: anyone sees whether it is up; the owner puts it up or down ----
/** Whether the room's booklet is up and where, asked over HTTP (free) and kept per room (keys.ts) */
const publication = useQuery({
  key: () => roomKeys.publication(here.room),
  query: () => here.api.publication(),
});
const published = computed(() => publication.data.value ?? null);
const isOwner = computed(() => me.value?.role === "owner");
/** Why the last change to the public page did not happen */
const FAILED = {
  failed: "shiori.publishFailed",
  day: "shiori.publishLimit",
  trip: "shiori.draftTripLimit",
} as const satisfies Record<Extract<Publishing, { kind: "failed" }>["why"], string>;
const when = (at: Temporal.Instant) =>
  at.toLocaleString(i18n.locale, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
/** The link copied, said for a moment on the button */
const copied = ref(false);
/** Copied again while it is said, the moment starts over: the earlier copy's end is not its end */
let copiedFor: ReturnType<typeof setTimeout> | undefined;
function uncopied() {
  copied.value = false;
}
async function copyLink() {
  if (import.meta.env.SSR) return;
  if (published.value === null) return;
  try {
    await navigator.clipboard.writeText(published.value.url);
    copied.value = true;
    clearTimeout(copiedFor);
    copiedFor = setTimeout(uncopied, 1500);
  } catch {
    // the link is on the page to select by hand
  }
}
</script>

<template>
  <section v-for="t in TAGS" :key="t">
    <CtHeading data-turn>#{{ t }}</CtHeading>
    <ul><li v-for="n in byTag(t)" :key="n.id" data-turn><CtPaper :paper="paperFor(n)" variant="row"><CtCheck
            :id="`${id}-check-${n.id}`"
            :model-value="n.checked"
            @update:model-value="(checked) => setChecked(n, checked)"
          ><span class="item">{{ n.title }}</span><small v-if="n.body !== ''" class="note"
            > —{{ n.body }}</small></CtCheck></CtPaper></li></ul>
    <CtHint v-if="byTag(t).length === 0" data-turn size="sm">{{
      i18n.t("shiori.tagEmpty")
    }}</CtHint>
  </section>
  <!-- the plan out to a calendar: confirmed notes, flights and stays -->
  <section class="out">
    <CtHeading data-turn>{{ i18n.t("shiori.out") }}</CtHeading>
    <CtButton data-turn @click="downloadCalendar">{{ i18n.t("shiori.calendar") }}</CtButton>
    <CtHint data-turn size="sm">{{ i18n.t("shiori.calendarHint") }}</CtHint>
    <!-- the booklet as a page anyone with its link can read -->
    <CtHeading as="h3" data-turn level="minor">{{ i18n.t("shiori.publicTitle") }}</CtHeading>
    <CtHint data-turn size="sm">{{ i18n.t("shiori.publicHint") }}</CtHint>
    <CtPanel v-if="published !== null" class="link" data-turn>
      <CtLink :href="published.url">{{ published.url }}</CtLink>
      <small>{{ i18n.t("shiori.publishedAt", { at: when(published.at) }) }}</small>
      <CtButton @click="copyLink">{{
        i18n.t(copied ? "shiori.copied" : "shiori.copyLink")
      }}</CtButton>
    </CtPanel>
    <CtHint v-else data-turn size="sm">{{
      i18n.t(isOwner ? "shiori.notPublished" : "shiori.ownerPublishes")
    }}</CtHint>
    <!-- one change at a time: either button waits while the other is under way -->
    <div v-if="isOwner" class="actions" data-turn>
      <CtButton
        :disabled="publishing.kind === 'asking' || cut.offline"
        :busy="publishing.kind === 'asking' && publishing.to === 'publish'"
        @click="() => putUp(here, i18n.locale)"
      >{{
        i18n.t(
          publishing.kind === "asking" && publishing.to === "publish"
            ? "shiori.publishing"
            : published === null
              ? "shiori.publish"
              : "shiori.republish",
        )
      }}</CtButton>
      <CtButton
        v-if="published !== null"
        :disabled="publishing.kind === 'asking' || cut.offline"
        @click="() => takeDown(here)"
      >{{ i18n.t("shiori.withdraw") }}</CtButton>
    </div>
    <CtMessage v-if="publishing.kind === 'failed'" aria-live="polite" danger>{{
      i18n.t(FAILED[publishing.why])
    }}</CtMessage>
    <CtHint v-else-if="isOwner && cut.offline">{{ i18n.t("offline.unavailable") }}</CtHint>
  </section>
</template>

<style scoped>
/* the appendix: a checklist written on the notes' own paper */
section {
  & + section {
    margin-block-start: 18px;
  }

  > h2 {
    margin: 20px 0 10px;
  }

  > ul {
    list-style: none;
    margin: 0;
    padding: 4px 0 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;

    /* each item a slip of its writer's paper (CtPaper row), the whole slip its box to tick (CtCheck) */
    > li {
      font-size: var(--font-base);

      .note {
        color: var(--paper-muted);
        font-size: var(--font-sm);
      }

      /* ticked: struck through in the paper's quieter ink, still readable */
      &:has(input:checked) .item {
        color: var(--paper-muted);
        text-decoration: line-through;
        text-decoration-thickness: 1.5px;
      }
    }
  }

  /* a section's own lines (CtHint, CtMessage) keep the paragraph's room above and below */
  > p {
    margin-block: 1em;
  }

  /* the public page: its link, as of when, and the owner's buttons */
  &.out {
    > h3 {
      margin: 22px 0 6px;
    }

    > .link {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      font-size: var(--font-sm);

      > a {
        flex-basis: 100%;
      }

      > small {
        color: var(--muted);
        font-size: var(--font-xs);
      }
    }

    > .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-block-start: 10px;
    }
  }
}
</style>
