import { computed } from "vue";

import { useMutation, useQuery, useQueryCache } from "@pinia/colada";

import type { RoomId } from "../rooms/types";
import { useRefreshRooms } from "../rooms/useRooms";
import { roomKeys } from "../sync/keys";
import { LOCAL } from "../sync/session";
import { useSync } from "../sync/useSync";

import { deleteRoom, fetchPeople, invite, leaveRoom, removeMember, uninvite } from "./api";
import type { MemberId } from "./types";

/**
 * Who may do what in the room of the session, over HTTP beside the socket: the owner, the
 * e-mails invited, and the changes to who is in. A room with no server (the mocks) has none.
 * Each change refreshes the answer and the list of trips, whatever happened.
 */
export function usePeople() {
  const sync = useSync();
  const queryCache = useQueryCache();
  const refreshRooms = useRefreshRooms();
  const room = computed(() => sync.roomId);
  const served = computed(() => room.value !== LOCAL);

  const { data, status, refetch } = useQuery({
    key: () => roomKeys.people(room.value),
    query: () => fetchPeople(room.value),
    enabled: () => served.value,
  });

  const refresh = () => {
    queryCache.invalidateQueries({ key: roomKeys.people(room.value) }).catch(() => {
      // the query's own error state reports it
    });
    refreshRooms();
  };
  const change = <V>(call: (room: RoomId, v: V) => Promise<unknown>) =>
    useMutation({ mutation: (v: V) => call(room.value, v), onSettled: refresh });

  const me = computed(() => sync.me);
  return {
    served,
    data,
    status,
    refetch,
    /** This device's person made the room */
    isOwner: computed(() => me.value !== null && data.value?.owner === me.value),
    invite: change((r, email: string) => invite(r, email)),
    uninvite: change((r, email: string) => uninvite(r, email)),
    remove: change((r, member: MemberId) => removeMember(r, member)),
    leave: useMutation({ mutation: () => leaveRoom(room.value), onSettled: refresh }),
    deleteRoom: useMutation({ mutation: () => deleteRoom(room.value), onSettled: refresh }),
  };
}
