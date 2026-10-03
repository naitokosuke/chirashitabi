import { useMutation, useQuery, useQueryCache } from "@pinia/colada";

import { createRoom, listRooms } from "./api";

/** The person's rooms, as `/api/me` lists them (docs/data-fetching.md) */
export const ROOMS_KEY = ["me", "rooms"];

/** The person's trips; refetched on focus, so a room the partner just made shows up */
export function useRoomList() {
  return useQuery({ key: ROOMS_KEY, query: listRooms });
}

/**
 * Creates a room; the list is refreshed whatever happens, so it never lies about what exists.
 * The refresh is not awaited: Pinia Colada awaits `onSettled` before the mutation leaves
 * `loading`, and a refresh that fails there would leave the create button busy for good.
 */
export function useCreateRoom() {
  const queryCache = useQueryCache();
  return useMutation({
    mutation: createRoom,
    onSettled: () => {
      queryCache.invalidateQueries({ key: ROOMS_KEY }).catch(() => {
        // the list's own error state reports it
      });
    },
  });
}
