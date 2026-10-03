import { Temporal } from "temporal-polyfill-lite";

import { ref } from "vue";

import { defineStore } from "pinia";

import { type EntryKeyTagged, useQueryCache } from "@pinia/colada";

import { useI18n } from "../../i18n/useI18n";

import type { MemberId } from "../members/types";
import { useToast } from "../toast/useToast";

import { roomKeys } from "./keys";
import { createLedger, EMPTY_ROOM, type RoomState } from "./ledger";
import { keep, kept } from "./persist";
import { createRoomSocket, type SocketStatus } from "./socket";
import type { Mutation } from "./types";
import { NOWHERE, useSync } from "./useSync";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "./wire";

export type RoomStatus = SocketStatus;

const STORAGE_KEY = "chirashitabi:room";

/**
 * A room, between the socket (socket.ts) and the cache the stores read (keys.ts). What the
 * room has confirmed and what of ours it has not answered yet is the ledger's (ledger.ts);
 * whatever it shows is written into the cache's three slices. Connecting installs the
 * transport the stores commit through (docs/data-fetching.md).
 */
export const useRoom = defineStore("room", () => {
  const sync = useSync();
  const queryCache = useQueryCache();
  const toast = useToast();
  const i18n = useI18n();

  const status = ref<RoomStatus>("idle");
  /** When the room's state last arrived whole; what the screen shows while reconnecting is from then */
  const syncedAt = ref<Temporal.Instant | null>(null);

  const ledger = createLedger(() => sync.me);

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
    const id = sync.roomId;
    if (id === null || syncedAt.value === null) return; // no room, or nothing from it yet
    keep(localStorage, id, {
      me: sync.me,
      confirmed: ledger.confirmed,
      pending: [...ledger.pending],
      savedAt: syncedAt.value,
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
      sync.me = msg.me as MemberId;
      show(
        ledger.snapshot({
          notes: msg.notes.map(reviveNote),
          trip: reviveTrip(msg.trip),
          members: msg.members.map(reviveMember),
        }),
      );
      syncedAt.value = Temporal.Now.instant();
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
      status.value = next;
    },
  });

  /** Ours: shown at once, kept until the room answers, sent now or after the next snapshot */
  function commit(m: Mutation) {
    const cid = crypto.randomUUID();
    show(ledger.commit(m, cid, Temporal.Now.instant()));
    socket.send(m, cid);
  }

  // The network is back: try the room now instead of waiting out the back-off (a live socket ignores this)
  window.addEventListener("online", () => socket.reconnect());

  /** Remembered on this device so the next visit opens the same room */
  function remembered(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function connect(id: string) {
    keepNow(); // the room being left, as it was
    // the stores read this room's cache entries from now on
    sync.roomId = id;
    // as it was kept on this device, if it was: the booklet opens before the room answers
    const was = kept(localStorage, id);
    syncedAt.value = was?.savedAt ?? null;
    // who we are in it, until the room says so again: what is written offline is signed
    sync.me = was?.me ?? ("" as MemberId);
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
    sync.roomId = null;
    syncedAt.value = null;
    sync.transport = NOWHERE;
  }

  /**
   * A room with no server (the mocks): `state` is the room, and ours are applied as the room
   * would confirm them, at once.
   */
  function offline(state: RoomState) {
    show(ledger.snapshot(state));
    sync.transport = {
      commit: (m) => show(ledger.relayed(m, sync.me, Temporal.Now.instant())),
      send: () => {},
    };
    status.value = "connected";
    syncedAt.value = Temporal.Now.instant();
  }

  return {
    status,
    syncedAt,
    remembered,
    connect,
    leave,
    reconnect: socket.reconnect,
    offline,
  };
});
