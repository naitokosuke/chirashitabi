import { computed } from "vue";

import { useMutation, useQuery, useQueryCache, useQueryState } from "@pinia/colada";

import type { RoomId } from "../rooms/types";
import { useRefreshRooms } from "../rooms/useRooms";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { deleteRoom, fetchInvited, invite, leaveRoom, removeMember, uninvite } from "./api";
import type { MemberId, Person } from "./types";

/**
 * The room's members, as the query cache holds them (keys.ts), written by the room; undefined
 * until its first snapshot. Call it in a component's setup: the cache is reached through the
 * app's injection.
 */
export function useMembers() {
  const sync = useSync();
  return useQueryState(() => roomKeys.members(sync.roomId)).data;
}

/**
 * Who is in the room of the session, and the changes to it over HTTP beside the socket: the
 * owner (`role`) invites by e-mail, takes an invitation back, removes someone and deletes the
 * room; a guest may leave. Whom the owner invited is asked by the owner only. Each change
 * refreshes that and the list of trips, whatever happened.
 */
export function useMembership() {
  const sync = useSync();
  const queryCache = useQueryCache();
  const refreshRooms = useRefreshRooms();
  const members = useMembers();
  const room = computed(() => sync.roomId);
  /** This device's person, once the room has said who is in it */
  const me = computed(() =>
    members.value?.find((m): m is Person => m.kind === "person" && m.id === sync.me),
  );

  const invited = useQuery({
    key: () => roomKeys.invited(room.value),
    query: () => fetchInvited(room.value),
    enabled: () => me.value?.role === "owner",
  });

  const refresh = () => {
    queryCache.invalidateQueries({ key: roomKeys.invited(room.value) }).catch(() => {
      // the query's own error state reports it
    });
    refreshRooms();
  };
  const change = <V>(call: (room: RoomId, v: V) => Promise<unknown>) =>
    useMutation({ mutation: (v: V) => call(room.value, v), onSettled: refresh });

  return {
    members,
    me,
    invited,
    invite: change((r, email: string) => invite(r, email)),
    uninvite: change((r, email: string) => uninvite(r, email)),
    remove: change((r, member: MemberId) => removeMember(r, member)),
    leave: useMutation({ mutation: () => leaveRoom(room.value), onSettled: refresh }),
    deleteRoom: useMutation({ mutation: () => deleteRoom(room.value), onSettled: refresh }),
  };
}
