import { computed } from "vue";

import { defineQuery, useMutation, useQuery, useQueryCache, useQueryState } from "@pinia/colada";

import type { RoomId } from "../rooms/types";
import { useRefreshRooms } from "../rooms/useRooms";
import { roomKeys } from "../sync/keys";
import { useSync } from "../sync/useSync";

import { deleteRoom, fetchInvited, invite, leaveRoom, removeMember, uninvite } from "./api";
import type { MemberId, Person } from "./types";

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
  const refreshRooms = useRefreshRooms();
  const { data: members } = useQueryState(() => roomKeys.members(sync.room.id));
  /** This device's person, once the room has said who is in it */
  const me = computed(() =>
    members.value?.find((m): m is Person => m.kind === "person" && m.id === sync.me),
  );

  const invited = useQuery({
    key: () => roomKeys.invited(sync.room.id),
    query: () => fetchInvited(sync.room.id),
    enabled: () => me.value?.role === "owner",
  });

  const refresh = () => {
    queryCache.invalidateQueries({ key: roomKeys.invited(sync.room.id) }).catch(() => {
      // the query's own error state reports it
    });
    refreshRooms();
  };
  const change = <V>(call: (room: RoomId, v: V) => Promise<unknown>) =>
    useMutation({ mutation: (v: V) => call(sync.room.id, v), onSettled: refresh });

  return {
    members,
    me,
    invited,
    invite: change((r, email: string) => invite(r, email)),
    uninvite: change((r, email: string) => uninvite(r, email)),
    remove: change((r, member: MemberId) => removeMember(r, member)),
    leave: useMutation({ mutation: () => leaveRoom(sync.room.id), onSettled: refresh }),
    deleteRoom: useMutation({ mutation: () => deleteRoom(sync.room.id), onSettled: refresh }),
  };
});
