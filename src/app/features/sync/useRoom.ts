import { Temporal } from "temporal-polyfill-lite";

import { shallowRef } from "vue";

import { defineStore } from "pinia";

import { type EntryKeyTagged, useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import type { Email } from "../members/types";
import type { ImageId } from "../notes/id";
import { imageSrc } from "../notes/image";
import type { Note } from "../notes/types";
import { askMine } from "../rooms/api";
import { parseRoomId, type Mine, type RoomId } from "../rooms/types";
import { ROOMS_KEY } from "../rooms/useRooms";
import { useToast } from "../toast/useToast";

import { roomKeys } from "./keys";
import { createLedger, EMPTY_ROOM, type RoomState } from "./ledger";
import { claim, forget, keep, kept, prune } from "./persist";
import { linked, opened, OUT, synced } from "./session";
import { createRoomSocket } from "./socket";
import type { Mutation } from "./types";
import { useSync } from "./useSync";
import { newCid, reviveMutation, reviveNote, reviveTrip, type GoneReason } from "./wire";

const STORAGE_KEY = "chirashitabi:room";
/** How long a picture that did not come is left before it is asked for again */
const WARM_AGAIN_MS = 60_000;

/**
 * A room, between the socket (socket.ts) and the cache the stores read (keys.ts). Where this
 * device is, out, joining or in, is the session's (session.ts), moved only by its transitions.
 * What the room has confirmed and what of ours it has not answered yet is the ledger's
 * (ledger.ts); whatever it shows is written into the cache's three slices. Connecting installs
 * the transport the stores commit through (docs/data-fetching.md).
 */
export const useRoom = defineStore("room", () => {
  const sync = useSync();
  const queryCache = useQueryCache();
  const toast = useToast();
  const i18n = useI18n();

  const ledger = createLedger();

  /** A slice that did not change is not written, so what reads it is not woken */
  function put<T>(key: EntryKeyTagged<T>, value: T) {
    if (queryCache.getQueryData(key) !== value) queryCache.setQueryData(key, value);
  }
  /** The ledger's view into the cache */
  function show(state: RoomState) {
    const id = sync.room;
    put(roomKeys.notes(id), state.notes);
    put(roomKeys.members(id), state.members);
    if (state.trip !== null) put(roomKeys.trip(id), state.trip);
    keepSoon();
    if (id !== null) warm(id, state.notes);
  }

  /**
   * The room's pictures, fetched once each while the room is reachable: the service worker
   * keeps every picture that comes through it (sw.js), so one fetched now is there on the
   * plane, whether or not a card showing it was ever on screen. Each is asked for once; one
   * that did not come is asked again only after a while, not on every change the room relays.
   */
  const warmed = new Map<ImageId, number>(); // when it may be asked for again: never, once it came
  function warm(room: RoomId, notes: Note[]) {
    if (!navigator.onLine) return;
    const now = Date.now();
    for (const n of notes) {
      const image = n.kind === "memo" || n.kind === "sticker" ? n.image : null;
      if (image === null || (warmed.get(image) ?? 0) > now) continue;
      warmed.set(image, Infinity);
      fetch(imageSrc(room, image), { priority: "low" }).catch(() =>
        warmed.set(image, Date.now() + WARM_AGAIN_MS),
      );
    }
  }

  // ---- kept on this device (persist.ts): a moment after the last change, and when the page goes away ----
  let keepTimer: ReturnType<typeof setTimeout> | null = null;
  function keepNow() {
    if (keepTimer !== null) clearTimeout(keepTimer);
    keepTimer = null;
    const s = sync.session;
    // only once this device is in it
    if (s.kind !== "in") return;
    keep(localStorage, s.room, {
      me: s.me,
      confirmed: ledger.confirmed,
      pending: [...ledger.pending],
      savedAt: s.syncedAt,
    });
  }
  function keepSoon() {
    if (keepTimer !== null) clearTimeout(keepTimer);
    keepTimer = setTimeout(keepNow, 400);
  }
  /**
   * The room being left (for another, for the trips, or with the page), kept as it was. What
   * the toast holds open in it (a delete waiting on its undo) goes through first, while changes
   * still go to that room: neither lost, nor told to the room opened next.
   */
  function keepLeaving() {
    if (sync.session.kind === "in") toast.settle();
    keepNow();
  }
  window.addEventListener("pagehide", keepLeaving);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") keepNow();
    // back on the page after the socket gave up: it tries again, as the person would
    else if (sync.session.kind !== "out" && sync.session.link === "failed") socket.reconnect();
  });

  /**
   * The room this device is in, remembered so the next visit opens it. Only once in: a link to a
   * room that never lets this device in is not where the next visit should go.
   */
  function remember() {
    const s = sync.session;
    if (s.kind !== "in") return;
    try {
      localStorage.setItem(STORAGE_KEY, s.room);
    } catch {
      // not remembered, nothing else changes
    }
  }

  const socket = createRoomSocket({
    // ours the room has not answered go again on every connection: it may never have got them
    pending: () => ledger.pending,
    onSnapshot(msg) {
      show(
        ledger.snapshot({
          notes: msg.notes.map(reviveNote),
          trip: reviveTrip(msg.trip),
          members: msg.members,
        }),
      );
      sync.session = synced(sync.session, msg.me, Temporal.Now.instant());
      remember();
    },
    onMutation(msg) {
      const m = reviveMutation(msg.mutation);
      show(ledger.relayed(m, msg.by, Temporal.Instant.from(msg.updatedAt)));
    },
    onAck(cid, updatedAt) {
      show(ledger.ack(cid, Temporal.Instant.from(updatedAt)));
    },
    onRejected(cid, reason) {
      const { dropped, view } = ledger.reject(cid);
      show(view);
      if (dropped !== undefined) {
        console.warn(`room: ${dropped.m.type} refused: ${reason}`);
        toast.show(i18n.t("room.refused"));
      }
    },
    onMembers(members) {
      show(ledger.members(members));
      // whom the owner still waits on, and the trip's tag in the list, changed with them
      const s = sync.session;
      if (s.kind !== "out") refresh(s.room);
    },
    onGone(reason) {
      const s = sync.session;
      if (s.kind !== "out") putOut(s.room, reason);
    },
    onUnanswered() {
      // refused, maybe: the room says nothing to a device whose person is no longer in it
      void check();
    },
    onStatus(next) {
      // "idle" is the socket left behind; the session leaves the room itself (leave)
      if (next !== "idle") sync.session = linked(sync.session, next);
    },
  });

  /** The last room this device was put out of, and why, for what shows the room to act on */
  const gone = shallowRef<{ room: RoomId; reason: GoneReason } | null>(null);

  /** Out of the room for `reason`; nothing of it stays on this device: it would open a room that refuses it */
  function putOut(room: RoomId, reason: GoneReason) {
    leave();
    forget(localStorage, room);
    // only the list: whom a room this device is out of invited is not its to ask
    queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
      // the list's own error state reports it
    });
    toast.show(i18n.t(`room.gone.${reason}`));
    gone.value = { room, reason };
  }

  /**
   * Asks the Worker who is signed in and which rooms are theirs (`/api/me`). What this device
   * kept of someone else (another person on this browser), or of a room its person is no
   * longer in, goes, and the room open goes with it. The room says nothing to a device it
   * refuses, and this is how the device finds out. Unanswered (offline, or Access asking to
   * sign in again), everything stays.
   */
  async function check() {
    let mine: Mine & { email: Email };
    try {
      mine = await askMine();
    } catch {
      return;
    }
    const someoneElse = claim(localStorage, mine.email);
    const rooms = mine.rooms.map((r) => r.id);
    prune(localStorage, rooms);
    const last = remembered();
    if (someoneElse || (last !== null && !rooms.includes(last))) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // still remembered: the room refuses this device when it is opened
      }
    }
    const s = sync.session;
    if (s.kind === "out") return;
    if (!rooms.includes(s.room)) {
      putOut(s.room, mine.deleted.some((d) => d.id === s.room) ? "deleted" : "removed");
    } else if (someoneElse) {
      // the person's own room, as the room shows it to them, and not as the one before kept it
      leave();
      forget(localStorage, s.room);
      connect(s.room);
    }
  }

  function refresh(room: RoomId) {
    const quiet = () => {
      // each query's own error state reports it
    };
    queryCache.invalidateQueries({ key: roomKeys.invited(room) }).catch(quiet);
    queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(quiet);
  }

  /**
   * Ours: shown at once, kept until the room answers, sent now or after the next snapshot.
   * Only in a room, where this device knows whose change it is; the views that make changes
   * are not shown before that.
   */
  function commit(m: Mutation) {
    const s = sync.session;
    if (s.kind !== "in") return;
    const cid = newCid();
    show(ledger.commit(m, cid, Temporal.Now.instant(), s.me));
    // after what is pending before it, at the pace the room takes
    socket.flush();
  }

  // The network is back: try the room now instead of waiting out the back-off (a live socket ignores this)
  window.addEventListener("online", socket.reconnect);

  // the stores commit through the room from now on; out of a room, commit and send do nothing
  sync.transport = { commit, send: (m) => void socket.send(m) };

  /** Remembered on this device so the next visit opens the same room */
  function remembered(): RoomId | null {
    try {
      return parseRoomId(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function connect(id: RoomId) {
    keepLeaving();
    // as it was kept on this device, if it was: the booklet opens before the room answers,
    // and what is written offline is signed by who this device was in it
    const was = kept(localStorage, id);
    // the stores read this room's cache entries from now on
    sync.session = opened(id, was);
    // (and nothing of the room before: its unanswered changes were kept with it)
    show(ledger.restore(was?.confirmed ?? EMPTY_ROOM, was?.pending ?? []));
    // in at once when this device kept the room; otherwise once the room answers (onSnapshot)
    remember();
    socket.connect(id);
  }

  /**
   * Out to the rooms screen to choose another trip. The room is no longer the one to reopen,
   * or the rooms screen would open it again at once; what this device kept of it stays.
   */
  function leave() {
    keepLeaving();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // still remembered: the next visit reopens it, nothing else changes
    }
    socket.leave();
    sync.session = OUT;
  }

  return {
    remembered,
    check,
    connect,
    leave,
    reconnect: socket.reconnect,
    gone,
  };
});
