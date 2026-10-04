import { useMutation, useQuery, useQueryCache } from "@pinia/colada";

import { deleteRoom, leaveRoom } from "../members/api";
import { forget } from "../sync/persist";

import { acceptInvitation, createRoom, declineInvitation, listMine, restoreRoom } from "./api";
import type { RoomId } from "./types";

/** The person's rooms, invitations and deleted trips, as `/api/me` lists them (docs/data-fetching.md) */
export const ROOMS_KEY = ["me", "rooms"];

/** The person's trips; refetched on focus, so a room the partner just made shows up */
export function useRoomList() {
  return useQuery({ key: ROOMS_KEY, query: listMine });
}

/**
 * The list is refreshed whatever a change to it did, so it never lies about what exists. The
 * refresh is not awaited: Pinia Colada awaits `onSettled` before the mutation leaves
 * `loading`, and a refresh that fails there would leave the button busy for good.
 */
function useListChange<V, R>(mutation: (vars: V) => Promise<R>) {
  const queryCache = useQueryCache();
  return useMutation({
    mutation,
    onSettled: () => {
      queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
        // the list's own error state reports it
      });
    },
  });
}

/** Creates a room; resolves with its id */
export const useCreateRoom = () => useListChange(createRoom);
/** Takes up an invitation as who one will be in the room */
export const useAcceptInvitation = () => useListChange(acceptInvitation);
export const useDeclineInvitation = () => useListChange(declineInvitation);
/**
 * Takes a trip off the list: the owner deletes it (restorable for a while), anyone else leaves
 * it. What this device kept of it goes too, or opening it would show a room that refuses it.
 */
export const useRemoveRoom = () =>
  useListChange(async ({ room, owner }: { room: RoomId; owner: boolean }) => {
    await (owner ? deleteRoom(room) : leaveRoom(room));
    forget(localStorage, room);
  });
/** Brings a deleted trip back */
export const useRestoreRoom = () => useListChange(restoreRoom);

/** The list is out of date: a room was left, deleted, or someone joined */
export function useRefreshRooms() {
  const queryCache = useQueryCache();
  return () => {
    queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
      // the list's own error state reports it
    });
  };
}
