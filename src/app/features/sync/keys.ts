import type { EntryKeyTagged } from "@pinia/colada";

import type { RoomId } from "../../../contract/ids";
import type { Member } from "../members/types";
import type { Note } from "../notes/types";
import type { TripSnapshot } from "../trip/types";

/** A slice's key, tagged with what the slice holds: reading or writing it is typed */
const slice =
  <T>(name: string) =>
  (roomId: RoomId) =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pinia Colada's tag is a type alone, with no value to make it from
    ["room", roomId, name] as unknown as EntryKeyTagged<T>;

/**
 * The cache keys of a room's three slices (docs/data-fetching.md). The room writes them; the
 * stores read them, for the room of the session (session.ts).
 */
export const roomKeys = {
  notes: slice<Note[]>("notes"),
  trip: slice<TripSnapshot>("trip"),
  members: slice<Member[]>("members"),
  /**
   * Not a slice of the socket's: the e-mails the owner invited, fetched over HTTP by the owner
   * only (useMembers), refreshed when the members change
   */
  invited: slice<string[]>("invited"),
};
