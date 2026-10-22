<script setup lang="ts" vapor>
import { Temporal } from "temporal-polyfill-lite";

import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";

import {
  CtButton,
  CtHeading,
  CtHint,
  CtHoldButton,
  CtListItem,
  CtMessage,
  CtPanel,
  CtSwipeAction,
  CtSwipeRow,
  CtTag,
  safeUrl,
} from "../../../ui/index";

import { useI18n } from "../../i18n/useI18n";

import Icon from "../../icons/Icon.vue";
import plusIcon from "../../icons/plus.svg";
import { useOffline } from "../sync/useOffline";
import { useRoom } from "../sync/useRoom";
import { useSync } from "../sync/useSync";
import { shortDate } from "../trip/format";

import Invitation from "./Invitation.vue";
import { datesLabel, whenLabel } from "./label";
import NewTrip from "./NewTrip.vue";
import type { RoomId, RoomSummary } from "./types";
import { useRooms } from "./useRooms";
import { shelve, whenOf } from "./when";

/**
 * The trips, and the sheet making a new one while `creating`. Where a trip or the sheet is, and
 * going there, is the page's: each link is `hrefOf` a trip or `newHref`, and a plain click on it
 * asks the page to go (`open`, `create`); so do closing the sheet and the trip it made.
 */
defineProps<{
  creating: boolean;
  hrefOf: (id: RoomId) => string;
  newHref: string;
}>();
const emit = defineEmits<{
  open: [room: RoomId];
  create: [];
  close: [];
  created: [room: RoomId];
}>();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const room = useRoom();
const sync = useSync();
/** Today, read again when the page comes back into view: a phone woken the next day moves on */
const today = shallowRef(Temporal.Now.plainDateISO());
const readToday = () => (today.value = Temporal.Now.plainDateISO());
onMounted(() => document.addEventListener("visibilitychange", readToday));
onBeforeUnmount(() => document.removeEventListener("visibilitychange", readToday));

const trips = useRooms();
const { data: mine, status: listStatus, refetch: refetchList } = trips.list;
/** Coming up and been, each in the order a person looks for them (when.ts) */
const shelves = computed(() => shelve(mine.value?.rooms ?? [], today.value));
const none = computed(
  () =>
    listStatus.value === "success" &&
    mine.value?.rooms.length === 0 &&
    mine.value.invitations.length === 0,
);

/** The trip slid aside, its way off the list showing at its end; one at a time */
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
    await remove({ room: r.id, action: r.owner ? "delete" : "leave" });
    slid.value = null;
    // the device's own memory of it too, so the root does not reopen it
    if (room.remembered() === r.id) room.leave();
  } catch {
    removeFailed.value = true;
    slid.value = null;
  }
}

/**
 * The deleted shelf, one thing at a time: a trip being brought back or gone for good, or which
 * of the two did not go through last
 */
type ShelfWork = "restoring" | "purging";
type Shelf =
  | { kind: "idle" }
  | { kind: ShelfWork; id: RoomId }
  | { kind: "failed"; what: ShelfWork };
const shelf = shallowRef<Shelf>({ kind: "idle" });
const busyWithDeleted = computed(
  () => shelf.value.kind === "restoring" || shelf.value.kind === "purging",
);
const shelfFailed = (what: ShelfWork) => shelf.value.kind === "failed" && shelf.value.what === what;
async function onShelf(kind: ShelfWork, id: RoomId, run: () => Promise<unknown>) {
  if (busyWithDeleted.value) return;
  shelf.value = { kind, id };
  try {
    await run();
    shelf.value = { kind: "idle" };
  } catch {
    shelf.value = { kind: "failed", what: kind };
  }
}
/** A deleted trip back on the shelf */
const bringBack = (id: RoomId) => onShelf("restoring", id, () => trips.restore.mutateAsync(id));
/** A deleted trip gone for good now, by its owner */
const purgeForGood = (id: RoomId) => onShelf("purging", id, () => trips.purge.mutateAsync(id));
const untilLabel = (until: Temporal.PlainDate) =>
  i18n.t("rooms.restoreUntil", { date: shortDate(until, i18n.locale) });

/** A trip's tag, its words worked out for the locale */
const tagOf = (r: RoomSummary) => ({
  name: r.name,
  dates: datesLabel(r.first, r.days, i18n.locale, i18n.t),
  when: whenLabel(whenOf(r, today.value), i18n.t),
  members: r.members,
  memos: i18n.t("rooms.memos", { count: r.memos }),
});

/** What a screen reader says for a tag: its name, then where it stands and when */
const labelOf = (r: RoomSummary) => {
  const t = tagOf(r);
  return [t.name, t.when, t.dates].filter((s) => s !== "").join(", ");
};
/**
 * A plain click goes in here, and says so; a modified one is left to the browser (a new tab, a
 * new window)
 */
function follow(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return false;
  e.preventDefault();
  return true;
}
function enter(e: MouseEvent, id: RoomId) {
  if (follow(e)) emit("open", id);
}
function startCreating(e: MouseEvent) {
  if (follow(e)) emit("create");
}

/** Opening a trip this device has nothing of: still trying, or given up; null otherwise */
const joining = computed(() => {
  const s = sync.session;
  if (s.kind !== "joining") return null;
  const name = mine.value?.rooms.find((r) => r.id === s.room)?.name ?? null;
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
        <CtHeading as="h1" level="page">chirashitabi</CtHeading>
        <CtMessage v-if="joining !== null && !joining.failed" boxed class="notice" role="status">
          {{
            joining.name === null
              ? i18n.t("rooms.connectingUnnamed")
              : i18n.t("rooms.connecting", { name: joining.name })
          }}
        </CtMessage>
        <CtMessage v-else-if="joining !== null" boxed class="notice" role="alert">
          {{ i18n.t("rooms.failed") }}
          <CtButton variant="primary" @click="retry">{{ i18n.t("rooms.retry") }}</CtButton>
        </CtMessage>
        <CtMessage v-if="removeFailed" boxed class="notice" role="alert">{{
          i18n.t("people.failed")
        }}</CtMessage>
        <CtMessage v-if="listStatus === 'error'" boxed class="notice" role="alert">
          {{ i18n.t("rooms.listFailed") }}
          <CtButton variant="primary" @click="retry">{{ i18n.t("rooms.retry") }}</CtButton>
        </CtMessage>

        <!-- two blank tags where the trips will hang, so nothing jumps when they arrive -->
        <div v-if="listStatus === 'pending'" class="tags">
          <CtTag variant="loading" />
          <CtTag variant="loading" />
          <p class="sr-only" role="status">{{ i18n.t("rooms.loading") }}</p>
        </div>

        <template v-else>
          <!-- a tag handed over by someone: first, since it waits for an answer -->
          <section v-if="mine !== undefined && mine.invitations.length > 0">
            <CtHeading>{{ i18n.t("rooms.invitations") }}</CtHeading>
            <ul class="tags">
              <li v-for="r in mine?.invitations" :key="r.id">
                <Invitation :room="r" :today @joined="(id) => emit('open', id)" />
              </li>
            </ul>
          </section>

          <section>
            <CtHint v-if="none" class="empty" size="lg">{{ i18n.t("rooms.none") }}</CtHint>
            <CtHeading v-else>{{ i18n.t("rooms.coming") }}</CtHeading>
            <ul class="tags">
              <li v-for="r in shelves.coming" :key="r.id">
                <!-- the tag slides aside (a finger, a mouse, ←) to show the way off the list -->
                <CtSwipeRow :open="slid === r.id" @toggle="(toOpen) => slide(r.id, toOpen)">
                  <template #default>
                    <a
                      :href="safeUrl(hrefOf(r.id))"
                      :aria-label="labelOf(r)"
                      @click="(e) => enter(e, r.id)"
                    >
                      <CtTag v-bind="tagOf(r)" />
                    </a>
                  </template>
                  <template #actions>
                    <CtSwipeAction
                      danger
                      :disabled="removing || cut.offline"
                      @click="() => takeOff(r)"
                    >
                      {{ r.owner ? i18n.t("rooms.delete") : i18n.t("rooms.leave") }}
                    </CtSwipeAction>
                  </template>
                </CtSwipeRow>
              </li>
              <!-- a blank tag: the next trip starts by writing one -->
              <li>
                <a :href="safeUrl(newHref)" @click="startCreating">
                  <CtTag variant="blank">
                    <Icon :size="18" :src="plusIcon" />{{ i18n.t("rooms.new") }}</CtTag>
                </a>
              </li>
            </ul>
          </section>

          <section v-if="shelves.been.length > 0">
            <CtHeading>{{ i18n.t("rooms.been") }}</CtHeading>
            <ul class="tags">
              <li v-for="r in shelves.been" :key="r.id">
                <!-- the tag slides aside (a finger, a mouse, ←) to show the way off the list -->
                <CtSwipeRow :open="slid === r.id" @toggle="(toOpen) => slide(r.id, toOpen)">
                  <template #default>
                    <a
                      :href="safeUrl(hrefOf(r.id))"
                      :aria-label="labelOf(r)"
                      @click="(e) => enter(e, r.id)"
                    >
                      <CtTag v-bind="tagOf(r)" past />
                    </a>
                  </template>
                  <template #actions>
                    <CtSwipeAction
                      danger
                      :disabled="removing || cut.offline"
                      @click="() => takeOff(r)"
                    >
                      {{ r.owner ? i18n.t("rooms.delete") : i18n.t("rooms.leave") }}
                    </CtSwipeAction>
                  </template>
                </CtSwipeRow>
              </li>
            </ul>
          </section>

          <!-- trips their owner deleted, kept a while in case it was a slip; either person brings one back -->
          <section v-if="mine !== undefined && mine.deleted.length > 0">
            <CtHeading>{{ i18n.t("rooms.deleted") }}</CtHeading>
            <CtMessage v-if="shelfFailed('restoring')" boxed class="notice" role="alert">{{
              i18n.t("rooms.restoreFailed")
            }}</CtMessage>
            <CtMessage v-if="shelfFailed('purging')" boxed class="notice" role="alert">{{
              i18n.t("rooms.purgeFailed")
            }}</CtMessage>
            <CtPanel as="ul" pad="none">
              <CtListItem
                v-for="d in mine?.deleted"
                :key="d.id"
                faded
                :notes="[untilLabel(d.until)]"
                :title="d.name"
              >
                <!-- both held down, not tapped: one brings it back, the other ends that for good -->
                <template #end>
                  <CtHoldButton
                    :label="i18n.t('rooms.restore')"
                    :done="i18n.t('rooms.restored')"
                    :disabled="busyWithDeleted || cut.offline"
                    @hold="() => bringBack(d.id)"
                  >
                    <template #hint>{{ i18n.t("rooms.hold") }}</template>
                  </CtHoldButton>
                  <CtHoldButton
                    danger
                    :label="i18n.t('rooms.purge')"
                    :done="i18n.t('rooms.purged')"
                    :disabled="busyWithDeleted || cut.offline"
                    @hold="() => purgeForGood(d.id)"
                  >
                    <template #hint>{{ i18n.t("rooms.hold") }}</template>
                  </CtHoldButton>
                </template>
              </CtListItem>
            </CtPanel>
          </section>
        </template>
      </div>
    </div>

    <Transition name="ct-slide">
      <NewTrip
        v-if="creating"
        @close="() => emit('close')"
        @created="(id) => emit('created', id)"
      />
    </Transition>
  </div>
</template>

<style scoped>
@import "../../../ui/styles/media.css";

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

.page {
  flex: 1;
  overflow-y: auto;
  padding: var(--page-top) var(--page-margin) calc(var(--dock-clear) + 24px);

  /* a shelf's name, with room above it from the shelf before */
  > section > h2 {
    margin: 28px 0 12px;
  }
}

/* the room did not answer, or the list did not come: said once, with the way to try again */
.notice {
  margin: 16px 0 0;
}

.empty {
  max-width: 32em;
  margin: 28px 0 16px;
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

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 3px;
    }
  }
}
</style>
