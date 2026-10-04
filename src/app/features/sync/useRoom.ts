import { Temporal } from "temporal-polyfill-lite";

import { shallowRef } from "vue";

import { defineStore } from "pinia";

import { type EntryKeyTagged, useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import type { GoneReason } from "../../../../worker/wire";
import type { MemberId } from "../members/types";
import { roomId, type RoomId } from "../rooms/types";
import { ROOMS_KEY } from "../rooms/useRooms";
import { useToast } from "../toast/useToast";
import { roomWorkerApi } from "../worker/api";
import { useWorker } from "../worker/useWorker";

import { roomKeys } from "./keys";
import { createLedger, EMPTY_ROOM, type RoomState } from "./ledger";
import { forget, keep, kept } from "./persist";
import { linked, opened, OUT, synced } from "./session";
import { createRoomSocket } from "./socket";
import type { Mutation } from "./types";
import { NOWHERE, useSync } from "./useSync";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "./wire";

const STORAGE_KEY = "chirashitabi:room";

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
  const worker = useWorker();
  const i18n = useI18n();

  const ledger = createLedger();

  /** A slice that did not change is not written, so what reads it is not woken */
  function put<T>(key: EntryKeyTagged<T>, value: T) {
    if (queryCache.getQueryData(key) !== value) queryCache.setQueryData(key, value);
  }
  /** The ledger's view into the cache */
  function show(state: RoomState) {
    const id = sync.room.id;
    put(roomKeys.notes(id), state.notes);
    put(roomKeys.members(id), state.members);
    if (state.trip !== null) put(roomKeys.trip(id), state.trip);
    keepSoon();
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
  window.addEventListener("pagehide", keepNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") keepNow();
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
    onSnapshot(msg) {
      show(
        ledger.snapshot({
          notes: msg.notes.map(reviveNote),
          trip: reviveTrip(msg.trip),
          members: msg.members.map(reviveMember),
        }),
      );
      sync.session = synced(sync.session, msg.me as MemberId, Temporal.Now.instant());
      remember();
      // ours the room has not answered go again: it may never have got them
      for (const p of ledger.pending) socket.send(p.m, p.cid);
    },
    onMutation(msg) {
      const m = reviveMutation(msg.mutation);
      show(ledger.relayed(m, msg.by as MemberId, Temporal.Instant.from(msg.updatedAt)));
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
      show(ledger.members(members.map(reviveMember)));
      // whom the owner still waits on, and the trip's tag in the list, changed with them
      const s = sync.session;
      if (s.kind !== "out") refresh(s.room);
    },
    onGone(reason) {
      const s = sync.session;
      if (s.kind === "out") return;
      // nothing of the room stays on this device: it would open a room that refuses it
      leave();
      forget(localStorage, s.room);
      // only the list: whom a room this device is out of invited is not its to ask
      queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
        // the list's own error state reports it
      });
      toast.show(i18n.t(`room.gone.${reason}`));
      gone.value = { room: s.room, reason };
    },
    onStatus(next) {
      // "idle" is the socket left behind; the session leaves the room itself (leave)
      if (next !== "idle") sync.session = linked(sync.session, next);
    },
  });

  /** The last room this device was put out of, and why, for what shows the room to act on */
  const gone = shallowRef<{ room: RoomId; reason: GoneReason } | null>(null);

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
    const cid = crypto.randomUUID();
    show(ledger.commit(m, cid, Temporal.Now.instant(), s.me));
    socket.send(m, cid);
  }

  // The network is back: try the room now instead of waiting out the back-off (a live socket ignores this)
  window.addEventListener("online", () => socket.reconnect());

  /** Remembered on this device so the next visit opens the same room */
  function remembered(): RoomId | null {
    try {
      return roomId(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function connect(id: RoomId) {
    keepNow(); // the room being left, as it was
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
    sync.transport = { commit, send: (m) => void socket.send(m) };
    // what the room's agent does for its members goes through the Worker, for this room
    worker.api = roomWorkerApi(id);
  }

  /**
   * Out to the rooms screen to choose another trip. The room is no longer the one to reopen,
   * or the rooms screen would open it again at once; what this device kept of it stays.
   */
  function leave() {
    keepNow();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // still remembered: the next visit reopens it, nothing else changes
    }
    socket.leave();
    sync.session = OUT;
    sync.transport = NOWHERE;
    worker.api = null;
  }

  return {
    remembered,
    connect,
    leave,
    reconnect: socket.reconnect,
    gone,
  };
});
