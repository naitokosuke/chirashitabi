import { defineQuery, useMutation, useQuery, useQueryCache } from "@pinia/colada";

import { deleteRoom, leaveRoom } from "../members/api";
import { ROOMS_KEY } from "../sync/keys";
import { forget } from "../sync/persist";

import {
  acceptInvitation,
  createRoom,
  declineInvitation,
  listMine,
  purgeRoom,
  restoreRoom,
} from "./api";
import type { RoomId } from "./types";

/**
 * The person's trips, and the changes to the list: making one, answering an invitation, taking
 * one off the list and bringing a deleted one back. The list is refetched on focus, so a room
 * the partner just made shows up, and refreshed whatever a change did, so it never lies about
 * what exists. The refresh is not awaited: Pinia Colada awaits `onSettled` before a mutation
 * leaves `loading`, and a refresh that fails there would leave the button busy for good.
 *
 * Defined once for the app (defineQuery), so every invitation on the list answers through the
 * same changes: one is answered at a time.
 */
export const useRooms = defineQuery(() => {
  const queryCache = useQueryCache();
  const list = useQuery({ key: ROOMS_KEY, query: listMine });

  /** The list is out of date: a room was left, deleted, or someone joined */
  const refresh = () => {
    queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
      // the list's own error state reports it
    });
  };
  const change = <V, R>(mutation: (vars: V) => Promise<R>) =>
    useMutation({ mutation, onSettled: refresh });

  return {
    list,
    refresh,
    /** Creates a room; resolves with its id, or why the Worker refused */
    create: change(createRoom),
    /** Takes up an invitation as who one will be in the room */
    accept: change(acceptInvitation),
    decline: change(declineInvitation),
    /**
     * Takes a trip off the list: the owner deletes it (restorable for a while), anyone else
     * leaves it. Once it is off, what this device kept of it goes too, or opening it would show
     * a room that refuses it.
     */
    remove: change(async ({ room, action }: { room: RoomId; action: "delete" | "leave" }) => {
      const off = await (action === "delete" ? deleteRoom(room) : leaveRoom(room));
      if (off.ok) forget(localStorage, room);
      return off;
    }),
    /** Brings a deleted trip back */
    restore: change(restoreRoom),
    /** Has a deleted trip gone for good now (its owner only) */
    purge: change(purgeRoom),
  };
});
