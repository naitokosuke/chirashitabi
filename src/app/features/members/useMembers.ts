import { computed } from "vue";

import { defineQuery, useMutation, useQuery, useQueryCache, useQueryState } from "@pinia/colada";

import type { RoomId } from "../rooms/types";
import { ROOMS_KEY } from "../rooms/useRooms";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { deleteRoom, fetchInvited, invite, leaveRoom, removeMember, uninvite } from "./api";
import type { Person } from "./types";

/**
 * Who is in the room of the session, and the changes to it over HTTP beside the socket. The
 * members are what the query cache holds (keys.ts), written by the room; undefined until its
 * first snapshot. The owner (`role`) invites by e-mail, takes an invitation back, removes
 * someone and deletes the room; a guest may leave. Whom the owner invited is asked by the owner
 * only. Each change refreshes that and the list of trips, whatever happened.
 *
 * Defined once for the app (defineQuery): every card on the desk reads the same members, and
 * the query and the changes are made once, not per component.
 */
export const useMembers = defineQuery(() => {
  const sync = useSync();
  const queryCache = useQueryCache();
  // what changes who is in is offered only in a room (People, on its home tab)
  const inRoom = (): RoomId => {
    if (sync.room === null) throw new Error("not in a room");
    return sync.room;
  };
  const { data: members } = useQueryState(() => roomKeys.members(sync.room));
  /** This device's person, once the room has said who is in it */
  const me = computed(() =>
    members.value?.find((m): m is Person => m.kind === "person" && m.id === sync.me),
  );

  const invited = useQuery({
    key: () => roomKeys.invited(sync.room),
    query: () => fetchInvited(inRoom()),
    enabled: () => sync.room !== null && me.value?.role === "owner",
  });

  // the list of trips is only marked out of date: it is not fetched while in a room
  const refresh = () => {
    for (const key of [roomKeys.invited(sync.room), ROOMS_KEY])
      queryCache.invalidateQueries({ key }).catch(() => {
        // each query's own error state reports it
      });
  };
  const change = <V>(call: (room: RoomId, v: V) => Promise<unknown>) =>
    useMutation({ mutation: (v: V) => call(inRoom(), v), onSettled: refresh });

  return {
    members,
    me,
    invited,
    invite: change(invite),
    uninvite: change(uninvite),
    remove: change(removeMember),
    leave: useMutation({ mutation: () => leaveRoom(inRoom()), onSettled: refresh }),
    deleteRoom: useMutation({ mutation: () => deleteRoom(inRoom()), onSettled: refresh }),
  };
});
