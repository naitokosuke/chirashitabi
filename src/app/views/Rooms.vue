<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { CtSwipeRow } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import moreIcon from "../icons/more.svg";
import plusIcon from "../icons/plus.svg";
import Icon from "../icons/Icon.vue";
import { KEPT_DAYS } from "../features/rooms/api";
import Invitation from "../features/rooms/Invitation.vue";
import { datesLabel, whenLabel } from "../features/rooms/label";
import NewTrip from "../features/rooms/NewTrip.vue";
import TripTag from "../features/rooms/TripTag.vue";
import type { RoomId, RoomSummary } from "../features/rooms/types";
import { useRooms } from "../features/rooms/useRooms";
import { shortDate } from "../features/trip/format";
import { shelve, whenOf } from "../features/rooms/when";
import { useRoom } from "../features/sync/useRoom";
import { initialState, locationOf } from "../shell";

const i18n = useI18n();
const room = useRoom();
const router = useRouter();
const route = useRoute();
const today = Temporal.Now.plainDateISO();

const trips = useRooms();
const { data: mine, status: listStatus, refetch: refetchList } = trips.list;
const rooms = computed(() => mine.value?.rooms);
const invitations = computed(() => mine.value?.invitations ?? []);
const deleted = computed(() => mine.value?.deleted ?? []);
/** Coming up and been, each in the order a person looks for them (when.ts) */
const shelves = computed(() => shelve(rooms.value ?? [], today));
const none = computed(
  () =>
    listStatus.value === "success" &&
    (rooms.value ?? []).length === 0 &&
    invitations.value.length === 0,
);

/** The trip whose way off the list is open under its tag */
const asking = ref<RoomId | null>(null);
const toggleAsk = (id: RoomId) => (asking.value = asking.value === id ? null : id);
/** The trip a finger slid aside, its way off the list showing at its end; one at a time */
const slid = ref<RoomId | null>(null);
function slide(id: RoomId, open: boolean) {
  if (open) slid.value = id;
  else if (slid.value === id) slid.value = null;
}
const { mutateAsync: remove, isLoading: removing } = trips.remove;
const removeFailed = ref(false);
/** Off the list: deleted by its owner (then on the deleted shelf), left by anyone else */
async function takeOff(r: RoomSummary) {
  removeFailed.value = false;
  try {
    await remove({ room: r.id, owner: r.owner });
    asking.value = null;
    slid.value = null;
    // the device's own memory of it too, so the root does not reopen it
    if (room.remembered() === r.id) room.leave();
  } catch {
    removeFailed.value = true;
    slid.value = null;
  }
}

/** A deleted trip back on the shelf; the one being restored, while it is */
const restore = trips.restore;
const restoring = ref<RoomId | null>(null);
const restoreFailed = ref(false);
async function bringBack(id: RoomId) {
  if (restoring.value !== null) return;
  restoring.value = id;
  restoreFailed.value = false;
  try {
    await restore.mutateAsync(id);
  } catch {
    restoreFailed.value = true;
  } finally {
    restoring.value = null;
  }
}
const untilLabel = (until: Temporal.PlainDate) =>
  i18n.t("rooms.restoreUntil", { date: shortDate(until, i18n.locale) });

/** A trip's tag, its words worked out for the locale */
const tagOf = (r: RoomSummary) => ({
  name: r.name,
  dates: datesLabel(r.first, r.days, i18n.locale, i18n.t),
  when: whenLabel(whenOf(r, today), i18n.t),
  members: r.members,
  memos: i18n.t("rooms.memos", { count: r.memos }),
});

/** Into a trip: the URL names it, and the shell enters it (App.vue) */
const placeOf = (id: RoomId) => locationOf({ kind: "room", room: id, state: initialState });
/** A trip's own path: built from a checked room id (a UUID), so nothing else gets into the href */
const hrefOf = (id: RoomId) => router.resolve(placeOf(id)).href;
/** What a screen reader says for a tag: its name, then where it stands and when */
const labelOf = (r: RoomSummary) => {
  const t = tagOf(r);
  return [t.name, t.when, t.dates].filter((s) => s !== "").join(", ");
};
/** A plain click goes in here; a modified one is left to the browser (a new tab, a new window) */
function follow(e: MouseEvent, to: () => unknown) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  to();
}
const enter = (e: MouseEvent, id: RoomId) => follow(e, () => router.push(placeOf(id)));

/** Making a trip is a step of its own (`/new`), so back puts the sheet away */
const creating = computed(() => route.path === "/new");
const startCreating = (e: MouseEvent) => follow(e, () => router.push("/new"));
function stopCreating() {
  const back = (window.history.state as { back?: unknown } | null)?.back;
  if (back === "/") router.back();
  else void router.replace("/");
}
/** The new trip takes the sheet's place: back from it goes to the list, not to an empty form */
const created = (id: RoomId) => router.replace(placeOf(id));

/** Opening a trip this device has nothing of: still trying, or given up; null otherwise */
const joining = computed(() => {
  const s = room.session;
  if (s.kind !== "joining") return null;
  const name = rooms.value?.find((r) => r.id === s.room)?.name ?? null;
  return { failed: s.link === "failed", name };
});
function retry() {
  room.reconnect();
  void refetchList();
}
</script>

<template>
  <div class="rooms">
    <div class="list" :inert="creating">
      <div class="page" :aria-busy="listStatus === 'pending'">
        <h1 class="wordmark">chirashitabi</h1>
        <p v-if="joining !== null && !joining.failed" class="notice" role="status">
          {{
            joining.name === null
              ? i18n.t("rooms.connectingUnnamed")
              : i18n.t("rooms.connecting", { name: joining.name })
          }}
        </p>
        <p v-else-if="joining !== null" class="notice" role="alert">
          {{ i18n.t("rooms.failed") }}
          <button type="button" @click="retry">{{ i18n.t("rooms.retry") }}</button>
        </p>
        <p v-if="removeFailed" class="notice" role="alert">{{ i18n.t("people.failed") }}</p>
        <p v-if="listStatus === 'error'" class="notice" role="alert">
          {{ i18n.t("rooms.listFailed") }}
          <button type="button" @click="retry">{{ i18n.t("rooms.retry") }}</button>
        </p>

        <!-- two blank tags where the trips will hang, so nothing jumps when they arrive -->
        <div v-if="listStatus === 'pending'" class="tags">
          <div aria-hidden="true" class="ghost"></div>
          <div aria-hidden="true" class="ghost"></div>
          <p class="sr-only" role="status">{{ i18n.t("rooms.loading") }}</p>
        </div>

        <template v-else>
          <!-- a tag handed over by someone: first, since it waits for an answer -->
          <section v-if="invitations.length">
            <h2>{{ i18n.t("rooms.invitations") }}</h2>
            <ul class="tags">
              <li v-for="r in invitations" :key="r.id">
                <Invitation :room="r" @joined="(id) => router.push(placeOf(id))" />
              </li>
            </ul>
          </section>

          <section>
            <p v-if="none" class="empty">{{ i18n.t("rooms.none") }}</p>
            <h2 v-else>{{ i18n.t("rooms.coming") }}</h2>
            <ul class="tags">
              <li v-for="r in shelves.coming" :key="r.id">
                <!-- under a finger the tag slides aside to show the way off the list; elsewhere "…" asks -->
                <CtSwipeRow :open="slid === r.id" @toggle="(open) => slide(r.id, open)">
                  <template #default>
                    <div class="held">
                      <a :href="hrefOf(r.id)" :aria-label="labelOf(r)" @click="(e) => enter(e, r.id)">
                        <TripTag v-bind="tagOf(r)" />
                      </a>
                      <button
                        class="more"
                        type="button"
                        :aria-expanded="asking === r.id"
                        :aria-label="i18n.t('rooms.actions', { name: r.name })"
                        @click="() => toggleAsk(r.id)"
                      >
                        <Icon :size="20" :src="moreIcon" />
                      </button>
                    </div>
                  </template>
                  <template #actions>
                    <button class="off" type="button" :disabled="removing" @click="() => takeOff(r)">
                      {{ r.owner ? i18n.t("rooms.delete") : i18n.t("rooms.leave") }}
                    </button>
                  </template>
                </CtSwipeRow>
                <!-- the way off the list, asked twice: the owner deletes it, anyone else leaves -->
                <div v-if="asking === r.id" class="ask">
                  <button class="danger" type="button" :disabled="removing" @click="() => takeOff(r)">
                    {{ r.owner ? i18n.t("people.deleteConfirm", { count: KEPT_DAYS }) : i18n.t("people.leave") }}
                  </button>
                  <button type="button" @click="() => (asking = null)">{{ i18n.t("people.cancel") }}</button>
                </div>
              </li>
              <!-- a blank tag: the next trip starts by writing one -->
              <li>
                <a class="blank" href="/new" @click="startCreating">
                  <span aria-hidden="true" class="hole"></span>
                  <Icon :size="18" :src="plusIcon" />{{ i18n.t("rooms.new") }}
                </a>
              </li>
            </ul>
          </section>

          <section v-if="shelves.been.length">
            <h2>{{ i18n.t("rooms.been") }}</h2>
            <ul class="tags">
              <li v-for="r in shelves.been" :key="r.id">
                <!-- under a finger the tag slides aside to show the way off the list; elsewhere "…" asks -->
                <CtSwipeRow :open="slid === r.id" @toggle="(open) => slide(r.id, open)">
                  <template #default>
                    <div class="held">
                      <a :href="hrefOf(r.id)" :aria-label="labelOf(r)" @click="(e) => enter(e, r.id)">
                        <TripTag v-bind="tagOf(r)" past />
                      </a>
                      <button
                        class="more"
                        type="button"
                        :aria-expanded="asking === r.id"
                        :aria-label="i18n.t('rooms.actions', { name: r.name })"
                        @click="() => toggleAsk(r.id)"
                      >
                        <Icon :size="20" :src="moreIcon" />
                      </button>
                    </div>
                  </template>
                  <template #actions>
                    <button class="off" type="button" :disabled="removing" @click="() => takeOff(r)">
                      {{ r.owner ? i18n.t("rooms.delete") : i18n.t("rooms.leave") }}
                    </button>
                  </template>
                </CtSwipeRow>
                <!-- the way off the list, asked twice: the owner deletes it, anyone else leaves -->
                <div v-if="asking === r.id" class="ask">
                  <button class="danger" type="button" :disabled="removing" @click="() => takeOff(r)">
                    {{ r.owner ? i18n.t("people.deleteConfirm", { count: KEPT_DAYS }) : i18n.t("people.leave") }}
                  </button>
                  <button type="button" @click="() => (asking = null)">{{ i18n.t("people.cancel") }}</button>
                </div>
              </li>
            </ul>
          </section>

          <!-- trips their owner deleted, kept a while in case it was a slip; either person brings one back -->
          <section v-if="deleted.length">
            <h2>{{ i18n.t("rooms.deleted") }}</h2>
            <p v-if="restoreFailed" class="notice" role="alert">{{ i18n.t("rooms.restoreFailed") }}</p>
            <ul class="gone">
              <li v-for="d in deleted" :key="d.id">
                <span>
                  <b>{{ d.name }}</b>
                  <small>{{ untilLabel(d.until) }}</small>
                </span>
                <button type="button" :disabled="restoring !== null" @click="() => bringBack(d.id)">
                  {{ i18n.t("rooms.restore") }}
                </button>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </div>

    <Transition name="ct-slide">
      <NewTrip v-if="creating" @close="stopCreating" @created="created" />
    </Transition>
  </div>
</template>

<style scoped>
@import "../../ui/styles/media.css";

.rooms {
  position: absolute;
  inset: 0;
  background: var(--bg);
}

.list {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

/* the app's name as the large title, where a trip's name stands on its home */
.wordmark {
  margin: 0;
  font-size: var(--font-display);
  font-weight: 700;
  line-height: 1.2;
}

.page {
  flex: 1;
  overflow-y: auto;
  padding: var(--page-top) var(--page-margin) calc(var(--dock-clear) + 24px);
}

/* the room did not answer, or the list did not come: said once, with the way to try again */
.notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  font-size: var(--font-md);
  color: var(--ink);

  > button {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 999px;
    border: 0;
    background: var(--ink);
    color: var(--on-ink);
    font-size: var(--font-sm);
    font-weight: 700;
  }
}

h2 {
  margin: 28px 0 12px;
  font-size: var(--font-2xl);
  font-weight: 700;
  line-height: 1.35;
}

.empty {
  max-width: 32em;
  margin: 28px 0 16px;
  font-size: var(--font-lg);
  line-height: 1.6;
  color: var(--muted);
  text-wrap: pretty;
}

.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;

  > li {
    min-width: 0;
  }

  /* a whole tag is the way into its trip */
  a {
    display: block;
    border-radius: 12px 20px 20px 12px;
    color: inherit;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;

    > :deep(.tag) {
      transition:
        box-shadow var(--duration-swap) var(--ease-morph),
        translate var(--duration-swap) var(--ease-morph);
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 3px;
    }

    /* picked up, a little, as a tag is when reached for */
    @media (--can-hover) {
      &:hover > :deep(.tag) {
        box-shadow: var(--shadow-lift);
        translate: 0 -1px;
      }
    }

    &:active > :deep(.tag) {
      translate: 0 1px;
      box-shadow: var(--shadow-tool);
    }
  }
}

/* a tag and, beside it, the way to its actions */
.held {
  display: flex;
  align-items: center;
  gap: 4px;

  > a {
    flex: 1;
    min-width: 0;
  }

  > .more {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: 50%;
    border: 0;
    background: transparent;
    color: var(--muted);

    &[aria-expanded="true"] {
      background: var(--wash);
      color: var(--ink);
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }

    @media (--can-hover) {
      &:hover {
        color: var(--ink);
      }
    }

    /* a finger slides the tag aside instead; a screen reader still finds the button */
    @media (--no-hover) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
}

/* slid aside, the way off the list at the tag's end: red, since the trip goes */
.off {
  flex: 1;
  min-inline-size: 84px;
  padding: 0 16px;
  border-radius: 16px;
  border: 0;
  background: var(--danger);
  color: var(--on-ink);
  font-size: var(--font-sm);
  font-weight: 700;

  &:disabled {
    opacity: 0.35;
  }
}

/* asked once more, under the tag */
.ask {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-block-start: 8px;

  > button {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 999px;
    border: 0;
    background: var(--wash);
    color: var(--ink);
    font-size: var(--font-sm);
    font-weight: 700;

    &.danger {
      background: var(--ink);
      color: var(--on-ink);
    }

    &:disabled {
      opacity: 0.35;
    }

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}

/* the blank tag: the tag's outline, dashed, waiting to be written on */
.tags {
  a.blank {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 72px;
    padding: 0 20px 0 52px;
    border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
    font-size: var(--font-base);
    font-weight: 700;
    color: var(--muted);
    transition:
      color var(--duration-swap) ease,
      border-color var(--duration-swap) ease,
      background-color var(--duration-swap) ease;

    > .hole {
      position: absolute;
      inset-inline-start: 18px;
      inset-block-start: 50%;
      translate: 0 -50%;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px dashed color-mix(in oklch, var(--ink) 28%, transparent);
    }

    @media (--can-hover) {
      &:hover {
        color: var(--ink);
        border-color: color-mix(in oklch, var(--ink) 55%, transparent);
        background: var(--surface);
      }
    }
  }
}

/* a deleted trip: its name in muted ink, and the way back */
.gone {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--line);

  > li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 10px 14px;

    & + li {
      border-block-start: 1px solid var(--line);
    }

    > span {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 2px;

      > b {
        overflow-wrap: anywhere;
        color: var(--muted);
      }

      > small {
        font-size: var(--font-xs);
        color: var(--muted);
      }
    }

    > button {
      min-height: var(--tap);
      padding: 0 14px;
      border-radius: 999px;
      border: 0;
      background: var(--wash);
      color: var(--ink);
      font-size: var(--font-sm);
      font-weight: 700;

      &:disabled {
        opacity: 0.35;
      }

      &:focus-visible {
        outline: 2px solid var(--ink);
        outline-offset: 2px;
      }
    }
  }
}

/* where a tag will be, while the list is on its way */
.ghost {
  height: 104px;
  border-radius: 12px 20px 20px 12px;
  background: var(--wash);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
