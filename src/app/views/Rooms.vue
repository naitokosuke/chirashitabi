<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import { CtAppBar } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import plusIcon from "../icons/plus.svg";
import Icon from "../icons/Icon.vue";
import { datesLabel, whenLabel } from "../features/rooms/label";
import NewTrip from "../features/rooms/NewTrip.vue";
import TripTag from "../features/rooms/TripTag.vue";
import type { RoomId, RoomSummary } from "../features/rooms/types";
import { useRoomList } from "../features/rooms/useRooms";
import { shelve, whenOf } from "../features/rooms/when";
import { useRoom } from "../features/sync/useRoom";
import { initialState, locationOf } from "../shell";

const i18n = useI18n();
const room = useRoom();
const router = useRouter();
const route = useRoute();
const today = Temporal.Now.plainDateISO();

const { data: rooms, status: listStatus, refetch: refetchList } = useRoomList();
/** Coming up and been, each in the order a person looks for them (when.ts) */
const shelves = computed(() => shelve(rooms.value ?? [], today));
const none = computed(() => listStatus.value === "success" && (rooms.value ?? []).length === 0);

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
      <CtAppBar>
        <template #default><p class="wordmark">chirashitabi</p></template>
      </CtAppBar>

      <div class="page" :aria-busy="listStatus === 'pending'">
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
          <section>
            <p v-if="none" class="empty">{{ i18n.t("rooms.none") }}</p>
            <h2 v-else>{{ i18n.t("rooms.coming") }}</h2>
            <ul class="tags">
              <li v-for="r in shelves.coming" :key="r.id">
                <a :href="hrefOf(r.id)" :aria-label="labelOf(r)" @click="(e) => enter(e, r.id)">
                  <TripTag v-bind="tagOf(r)" />
                </a>
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
                <a :href="hrefOf(r.id)" :aria-label="labelOf(r)" @click="(e) => enter(e, r.id)">
                  <TripTag v-bind="tagOf(r)" past />
                </a>
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

.wordmark {
  margin: 0;
  padding-inline: 16px;
  font-size: var(--font-2xl);
  font-weight: 700;
}

.page {
  flex: 1;
  overflow-y: auto;
  padding: 4px var(--page-margin) calc(40px + env(safe-area-inset-bottom, 0px));
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
