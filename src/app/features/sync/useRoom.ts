import { Temporal } from "temporal-polyfill-lite";

import { computed } from "vue";

import { defineStore } from "pinia";

import { type EntryKeyTagged, useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import type { MemberId } from "../members/types";
import { roomId, type RoomId } from "../rooms/types";
import { useToast } from "../toast/useToast";

import { roomKeys } from "./keys";
import { createLedger, EMPTY_ROOM, type RoomState } from "./ledger";
import { keep, kept } from "./persist";
import { linked, LOCAL, opened, OUT, synced } from "./session";
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
  const i18n = useI18n();

  const ledger = createLedger();

  /** A slice that did not change is not written, so what reads it is not woken */
  function put<T>(key: EntryKeyTagged<T>, value: T) {
    if (queryCache.getQueryData(key) !== value) queryCache.setQueryData(key, value);
  }
  /** The ledger's view into the cache */
  function show(state: RoomState) {
    const id = sync.roomId;
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
    // only a room with a server, and only once this device is in it
    if (s.kind !== "in" || s.room === LOCAL) return;
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
    onStatus(next) {
      // "idle" is the socket left behind; the session leaves the room itself (leave)
      if (next !== "idle") sync.session = linked(sync.session, next);
    },
  });

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
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // not remembered, nothing else changes
    }
    socket.connect(id);
    sync.transport = { commit, send: (m) => void socket.send(m) };
  }

  function leave() {
    keepNow();
    socket.leave();
    sync.session = OUT;
    sync.transport = NOWHERE;
  }

  /**
   * A room with no server (the mocks): `state` is the room, `me` who this device is in it, and
   * ours are applied as the room would confirm them, at once.
   */
  function offline(state: RoomState, me: MemberId) {
    sync.session = {
      kind: "in",
      room: LOCAL,
      me,
      syncedAt: Temporal.Now.instant(),
      link: "connected",
    };
    show(ledger.snapshot(state));
    sync.transport = {
      commit: (m) => show(ledger.relayed(m, me, Temporal.Now.instant())),
      send: () => {},
    };
  }

  return {
    /** Where this device is; read it here, the session moves only through this store */
    session: computed(() => sync.session),
    remembered,
    connect,
    leave,
    reconnect: socket.reconnect,
    offline,
  };
});
